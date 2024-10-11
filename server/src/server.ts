import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	Hover,	
	TextEdit,
	type DocumentDiagnosticReport,
	integer
} from 'vscode-languageserver/node';

import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import { Interface } from 'node:readline/promises';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);
    const result: InitializeResult = {
        capabilities: {
			renameProvider : true,
			documentRangeFormattingProvider: true,
			documentFormattingProvider : true,
			hoverProvider : true,
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
				triggerCharacters: [ '.' ]
            },
            diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			}
        }
    };
    if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});


connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// In this simple example we get the settings for every validate run.
	const settings = await getDocumentSettings(textDocument.uri);
	let maxNumberOfProblems:number = 100;
	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < maxNumberOfProblems) {
		problems++;
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}
	return diagnostics;
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});


// Keywords da suggerire
//const keywords = [
//	{ label: '#LET', kind: CompletionItemKind.Keyword, detail: 'Assign variable' },
//	{ label: '#LETS', kind: CompletionItemKind.Keyword, detail: 'Assign string' },
//	{ label: '#MSG', kind: CompletionItemKind.Keyword, detail: 'Print message' },
//  ];


// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		
		//return keywords.map(kw => ({
		//	label: kw.label,
		//	kind: kw.kind,
		//	detail: kw.detail
		//  }));
		
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2
			}
		]
	}
);


// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		if (item.data === 1) {
			item.detail = 'TypeScript details';
			item.documentation = 'TypeScript documentation';
		} else if (item.data === 2) {
			item.detail = 'JavaScript details';
			item.documentation = 'JavaScript documentation';
		}
		return item;
	}
);

const prefixesIncrease = ['#if', '#elseif', '#else', '#for', '#select', '#case', '#cases', '#default'];
const prefixesDecrease = ['#endif', '#endfor', '#endselect', '#case', '#cases', '#default'];

function formatRange(text: string): string {
	let delta = 0;
    return text.split('\n').map(line => {
		const lowerCaseLine = line.trim().toLowerCase();
		if (prefixesDecrease.some(prefixesDecrease => lowerCaseLine.startsWith(prefixesDecrease.toLowerCase()))) {
			delta -= 4;
		}
		let lineFormatted = line.padStart(line.trim().length + delta);
		if (prefixesIncrease.some(prefixesIncrease => lowerCaseLine.startsWith(prefixesIncrease.toLowerCase()))) {
			delta += 4;
		}
        return lineFormatted;
    }).join('\n');
}

connection.onDocumentRangeFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const start = params.range.start;
    const end = params.range.end;
    const text = document.getText({
        start,
        end
    });

    // Applica la tua logica di formattazione al testo selezionato
    const formattedText = formatRange(text);

    // Calcola il range da sostituire
    const edit: TextEdit = {
        range: {
            start,
            end
        },
        newText: formattedText
    };

    // Restituisce l'edit al client
    return [edit];
});

documents.listen(connection);

connection.onHover((params) => {
    const position = params.position;
	const document = documents.get(params.textDocument.uri);
	if (document != undefined) {
		const text = document.getText(); // Ottieni tutto il testo del documento

		// Trova la parola su cui si trova il cursore
		const lines = text.split(/\r?\n/g);
		const line = lines[position.line];
		const word = getWordAtPosition(line, position);

		// Controlla se il cursore è su "#msg" e restituisci la descrizione
		if (word === '#msg') {
			return {
				contents: {
					kind: 'markdown',
					value: "**#msg**: Prints a message to the screen.\n\nExample usage: `#msg \"Hello, world!\"`"
				}
			};
		}
	}
    
    // Se non è "#msg", non fare nulla
    return null;
});

// Funzione per ottenere la parola alla posizione del cursore
function getWordAtPosition(line:String, position:Position) {
    const words = line.split(/\s+/);
    let currentLength = 0;
    for (const word of words) {
        currentLength += word.length;
        if (position.character <= currentLength) {
            return word;
        }
        currentLength++; // aggiungi 1 per lo spazio
    }
    return '';
}

connection.listen();
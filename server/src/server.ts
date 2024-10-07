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
	SemanticTokensParams,
	SemanticTokens,
	SemanticTokensLegend,
	type DocumentDiagnosticReport
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

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
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true
            },
			semanticTokensProvider: {
                full: true,
                legend: {
                    tokenTypes: [
                        'variable',
                        'vector',
                        'vectorSeparator',
                        'vectorIndex'
                    ],
                    tokenModifiers: ['defaultLibrary']
                }
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

// Semantic Highlight

const tokenTypesLegend = ['variable', 'vector', 'vectorSeparator', 'vectorIndex'];
const tokenModifiersLegend = ['defaultLibrary'];

const legend: SemanticTokensLegend = {
    tokenTypes: tokenTypesLegend,
    tokenModifiers: tokenModifiersLegend
};

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { data: [] }; // Restituisci un array vuoto se il documento non esiste
    }

    const text = document.getText();
	const tokens: number[] = [];
    // Esempio semplice di generazione di token semantici
    const lines = text.split('\n');

    // Qui inserisci la tua logica per la tokenizzazione del testo
	const variableRegex = /\$\([a-zA-Z0-9_]*\)/g;
    const vectorRegex = /\$\([a-zA-Z0-9_]*\):(\d+)/g;

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        let match;

        // Aggiungi variabili
        while ((match = variableRegex.exec(line)) !== null) {
            const startChar = match.index;
            const length = match[0].length;
            const tokenTypeIndex = tokenTypesLegend.indexOf('variable');
            const tokenModifierIndex = tokenModifiersLegend.indexOf('defaultLibrary');
            tokens.push(...encodeToken(lineNumber, startChar, length, tokenTypeIndex, tokenModifierIndex));
        }

        // Aggiungi vettori e gestisci i due punti e l'indice
        while ((match = vectorRegex.exec(line)) !== null) {
            // Nome del vettore
            const vectorStartChar = match.index;
            const vectorLength = match[0].length - match[1].length - 1; // Lunghezza del nome del vettore senza ':indice'
            const tokenTypeIndex = tokenTypesLegend.indexOf('vector');
            tokens.push(...encodeToken(lineNumber, vectorStartChar, vectorLength, tokenTypeIndex, 0));

            // Due punti
            const colonIndex = vectorStartChar + vectorLength; // Posizione del ':'
            const tokenTypeSeparatorIndex = tokenTypesLegend.indexOf('vectorSeparator');
            tokens.push(...encodeToken(lineNumber, colonIndex, 1, tokenTypeSeparatorIndex, 0));

            // Indice del vettore
            const indexStartChar = colonIndex + 1; // Posizione dell'indice
            const indexLength = match[1].length;   // Lunghezza dell'indice
            const tokenTypeIndexIndex = tokenTypesLegend.indexOf('vectorIndex');
            tokens.push(...encodeToken(lineNumber, indexStartChar, indexLength, tokenTypeIndexIndex, 0));
        }
    }
	
    return { data: tokens };
});


// Funzione per codificare i token
function encodeToken(line: number, start: number, length: number, tokenType: number, tokenModifier: number): number[] {
    // Codifica il token nel formato richiesto dal protocollo dei token semantici
    return [line, start, length, tokenType, tokenModifier];
}


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

	// The validator creates diagnostics for all uppercase words length 2 and more
	const text = textDocument.getText();
	const pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	const diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
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

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
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
		];
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

documents.listen(connection);
connection.listen();
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
	SemanticTokensBuilder,
	Range,	
	TextEdit,
	type DocumentDiagnosticReport,
	Position
} from 'vscode-languageserver/node';

import {  TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import path = require('path');
import * as fs from 'fs';


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
			documentFormattingProvider : true,
			hoverProvider : true,
            textDocumentSync: TextDocumentSyncKind.Incremental,
			definitionProvider: true, 
            completionProvider: {
                resolveProvider: true,
				triggerCharacters: [ '.' ]
            },
/* 			semanticTokensProvider: {
                full: true,
                legend: {
                    tokenTypes: [
                        'variable',
                        'vector',
                        'vectorSeparator',
                        'string'
                    ],
                    tokenModifiers: ['defaultLibrary']
                }
            }, */
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


function getImportFilePath(importPath:string, currentFile:string, documentExtension:string) {
    // Verifico che sia presente nella cartella principale del progetto il file selezionato con la corretta estensione
    const directory = path.dirname(currentFile);
    const resolvedPath = path.resolve(directory, `${importPath}.${documentExtension}`);
	if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
	}
    return null;
}


connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}
    const lines = document.getText().split('\n');
    const position = params.position;
    const line = lines[position.line];
	// Cerca la parola iniziale, che potrebbe corrispondere a una macro
	// In base all'estensione definisco una regex differente
	let importMatch = /^\s*([^\s;]+)/.exec(line);
	let documentExtension = 'm3c';
    if (document.languageId === 'vb') {
		importMatch = /^\s*''\s*INC\s*.*/.exec(line);
		documentExtension = 'xp';
	}
    if (importMatch) {
        const importPath = importMatch[0].replace("''", "").replace("INC", "").replace(/ /g, "");
        const currentFile = URI.parse(document.uri).fsPath;
        const filePath = getImportFilePath(importPath, currentFile, documentExtension);
        if (filePath) {
            const targetUri = `file:${filePath}`;
            return {
                uri: targetUri,
                range: {
                    start: Position.create(0, 0),
                    end: Position.create(0, 0)
                }
            };
        }
    }
    return null;
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
	if (document) {
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


const tokenTypesLegend = ['variable', 'vector', 'vectorSeparator', 'string'];
const tokenModifiersLegend = ['defaultLibrary'];

// Regex per identificare stringhe multilinee con variabili
//const allCanc = /#.+/gmi;
//const multiLinesStringRegex = /#lets\s*[a-zA-Z0-9_]*\s*=(.*\\\n)+.*$/gmi;
// const variableInStringRegex = /\$\([a-zA-Z0-9_]+\)/g;



/* connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
	const tokens = new SemanticTokensBuilder();
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { data: [] }; // Restituisce un array vuoto se il documento non esiste
    }
 	if (document.languageId === '3cad') {
		const lines = document.getText().split(/\r?\n/);
		const multiLinesStringRegex = /(#lets)\s*([a-zA-Z0-9_]*)\s*(=)\s*(.*)$/
		const backslashPattern = /\\\s*$/;
		const noBackSlashPattern = /^(?!.*\\\s*$).+/;
		let m: RegExpExecArray | null;
		for (let i = 1; i < lines.length; i++) {
			if (allCanc.test(lines[i])) {
				tokens.push(...[
					i,
					0,
					lines[i].length,
					tokenTypesLegend.indexOf('string'),
					0
				]);
			}
		const previousLine = lines[i - 1];
			if ((backslashPattern.test(previousLine))) {
				if (noBackSlashPattern.test(lines[i])) {
					const tokenTypeStringIndex = tokenTypesLegend.indexOf('string');
					tokens.push(...[i, 0, lines[i].length, tokenTypeStringIndex, 0]);
				}
			}
		}
	} 

-- 	if (document.languageId === '3cad') {
		let match : RegExpExecArray | null;
		const text = document.getText();
		while ((match = allCanc.exec(text))) {
			let startIndex = match.index;
			let startPosition = document.positionAt(startIndex);
			tokens.push(...[
				startPosition.line, 
				startPosition.character,
				1, 
				3, 
				0]
			);	
		}
	}--
	return tokens.build(); 
}); */


// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

const pattern = /#(?!let\b|lets\b|letv\b|msg\b|if\b|elseif\b|else\b|endif\b|for\b|endfor\b|select\b|endselect\b|case\b|cases\b|default\b|break\b|vb\b|endvb\b)\w+/gi;

// Regex per assegnazione stringa
const stringRegex = /#lets\s+\w+\s*=\s*.*#?.*/gi; 

// https://github.com/microsoft/vscode-extension-samples/blob/0107f5a8ee940a46a03c8bdcbfdd172a8ff56059/lsp-sample/server/src/server.ts#L162
async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	const diagnostics: Diagnostic[] = [];
	if (textDocument.languageId === '3cad') {
		// In this simple example we get the settings for every validate run.
		const settings = await getDocumentSettings(textDocument.uri);
		// The validator creates diagnostics for all uppercase words length 2 and more
		const text = textDocument.getText();
		let m: RegExpExecArray | null;
		let problems = 0;
		const stringMatches = [...text.matchAll(stringRegex)].map(match => ({
			start: match.index!,
			end: match.index! + match[0].length
		}));
		while ((m = pattern.exec(text))) {
			const commandPosition = m.index!;
			const isInsideString = stringMatches.some(stringRange => {
				return commandPosition >= stringRange.start && commandPosition <= stringRange.end;
			});
			// Verifico che il comando non sia all'interno di una stringa
			if (isInsideString) {
				continue;
			}

			problems++;
			const diagnostic: Diagnostic = {
				severity: DiagnosticSeverity.Error,
				range: {
					start: textDocument.positionAt(m.index),
					end: textDocument.positionAt(m.index + m[0].length)
				},
				message: `${m[0]} is not define.`,
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
		
		const mySystemFunctions: CompletionItem[] = [
			{ label: '#LET', kind: CompletionItemKind.Keyword, detail: 'Assegnazione variabile numerica', documentation: 'Sintassi: `#LET <nome_variabile> = valore`' },
			{ label: '#LETS', kind: CompletionItemKind.Keyword, detail: 'Assegnazione stringa', documentation: 'Sintassi: `#LETS <nome_variabile> = stringa`' },
			{ label: '#LETV', kind: CompletionItemKind.Keyword, detail: 'Forza il valore di una variante', documentation: 'Sintassi: `#LETV <nome_variante>  = <valore>`' }, 
			{ label: '#MSG', kind: CompletionItemKind.Function, detail: 'Stampa un messaggio a schermo', documentation: 'Sintassi: `#MSG (message: string)`' }, 
			{ label: '#VB', kind: CompletionItemKind.Function, detail: 'Include la sintassi visual basic', documentation: 'Sintassi: `#VB .... #ENDVB`' }, 
		];

		return mySystemFunctions;
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

// Prefissi per aumentare l'indentazione 
const prefixesIncrease = ['#if', '#elseif', '#else', '#for', '#select', '#case', '#cases', '#default'];

// Prefissi per diminuire l'indentazione 
const prefixesDecrease = ['#endif', '#endfor', '#endselect', '#case', '#cases', '#default'];

function formatDocument(text: string): string {
	let delta = 0;
    return text.split('\n').map(line => {
		const lowerCaseLine = line.trim().toLowerCase();
		if (prefixesDecrease.some(prefixesDecrease => lowerCaseLine.startsWith(prefixesDecrease.toLowerCase()))) {
			delta -= 2;
		}
		let lineFormatted = line.trim().padStart(line.trim().length + delta);
		if (prefixesIncrease.some(prefixesIncrease => lowerCaseLine.startsWith(prefixesIncrease.toLowerCase()))) {
			delta += 2;
		}
        return lineFormatted;
    }).join('\n');
}

connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    const text = document.getText();
    // Applica la tua logica di formattazione al documento
    const formattedText = formatDocument(text);
	const fullRange: Range = {
        start: { line: 0, character: 0 },
        end: { line: document.lineCount - 1, character: Number.MAX_SAFE_INTEGER }
    };
    // Restituisce la modifica al client
    return [TextEdit.replace(fullRange, formattedText)];
});

documents.listen(connection);

// Definizione delle funzioni di sistema
const systemFunctions: { [key: string]: string } = {
	"#MSG": "Stampa un messaggio a schermo.\n\n**Sintassi**: `#MSG <stringa>`",
	"#LET": "Assegnazione variabile numerica.\n\n**Sintassi**: `#LET <nome_variabile> = valore`",
	"#LETS": "Assegnazione stringa.\n\n**Sintassi**: `#LETS <nome_variabile> = stringa`",
	"#LETV": "Forza il valore di una variante.\n\n**Sintassi**: `#LETV <nome_variante> = valore`",
	"#VB": "Include la sintassi visual basic.\n\n**Sintassi**: `#VB ... #ENDVB`",
	// @TODO: Aggiungi altre funzioni di sistema
};

connection.onHover((params) => {
	const document = documents.get(params.textDocument.uri);
	if (document) {
		const position = params.position;
		const word = getWordAtPosition(document, position); // Trova la parola su cui si trova il cursore
		if (systemFunctions[word]) {
			return {
				contents: {
					kind: "markdown",
					value: systemFunctions[word]
				}
			};
		}
	}
    return null;
});

// Funzione per ottenere la parola alla posizione del cursore
function getWordAtPosition(document:TextDocument, position:Position) {
	const text = document.getText({
		start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER }
	});
	const words = text.split(/\s+/);
    const index = position.character;
    for (let word of words) {
        if (index >= text.indexOf(word) && index <= text.indexOf(word) + word.length) {
            return word;
        }
    }
    return '';
}

connection.listen();
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItem,
  createConnection,
  DefinitionLink,
  DefinitionParams,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { parseProgram } from "../../src/parser";
import { BUILT_IN_DOCS, BUILT_INS } from "../../src/runtime";
import { mapStringIndexToCharacterAndLine, tokenize } from "../../src/tokenize";
import { Token } from "../../src/types";

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  console.log("Intiialize lsp");
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
        resolveProvider: true,
      },
      hoverProvider: true,
      definitionProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

interface Settings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = { maxNumberOfProblems: 1000 };
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <Settings>(
      (change.settings.languageServerExample || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<Settings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "teganLanguageServer",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

/**
 * Provides error messages in open files
 */
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  const program = parseProgram(text);

  for (const error of program.errors) {
    if (error.message.includes("into")) {
      continue;
    }
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(error.regionStart),
        end: textDocument.positionAt(error.regionEnd),
      },
      message: error.message,
    };

    diagnostics.push(diagnostic);
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {});

/**
 * Autocomplete provider
 *
 * For now, only autocomplete built-in functions
 */
connection.onCompletion(
  async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const text = doc.getText();
    const token = getTokenAtPosition(text, params);

    if (!token) {
      return [];
    }

    switch (token.kind) {
      case "StringToken":
      case "WhitespaceToken":
      case "NumberToken":
      case "NewlineToken":
      case "IntoToken":
      case "CommentToken":
      case "OutroToken":
      case "ConditionalToken":
      case "UseToken":
      case "PushToStackToken": {
        return [];
      }
      case "NameToken": {
        return Object.keys(BUILT_INS)
          .filter((name) => name.startsWith(token.value))
          .map((name) => {
            return { label: name };
          });
      }
      case "LabelToken": {
        return [];
      }
    }
  }
);

/**
 * Find the specific token at a particular position
 */
function getTokenAtPosition(
  text: string,
  params: TextDocumentPositionParams
): Token | null {
  const tokens = tokenize(text);
  for (const token of tokens) {
    const mapped = mapStringIndexToCharacterAndLine(
      text,
      token.startIndex,
      token.endIndex
    );
    if (mapped.line !== params.position.line) {
      continue;
    }

    const end = mapped.start + mapped.length;
    const isAtOrAfterStart = mapped.start <= params.position.character;
    const isAtOrBeforeEnd = params.position.character <= end;

    if (isAtOrAfterStart && isAtOrBeforeEnd) {
      return token;
    }
  }
  return null;
}

connection.onExecuteCommand(async () => {
  return null;
});

connection.onHover(
  async (params: TextDocumentPositionParams): Promise<Hover | undefined> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return;

    const text = doc.getText();
    let markdown: null | string = null;

    const token = getTokenAtPosition(text, params);
    if (!token) return;

    switch (token.kind) {
      case "PushToStackToken": {
        markdown = `Push an item onto the stack`;
        break;
      }
      case "NameToken": {
        if (BUILT_IN_DOCS[token.value]) {
          markdown = BUILT_IN_DOCS[token.value];
        }
        break;
      }
      case "NumberToken": {
        markdown = `A number`;
        break;
      }
      case "StringToken": {
        markdown = `A string`;
        break;
      }
      case "WhitespaceToken":
      case "NewlineToken": {
        break;
      }
      case "IntoToken": {
        markdown = "A into block, with a local stack";
        break;
      }
      case "CommentToken": {
        break;
      }
      case "OutroToken": {
        markdown = "The closing end of an into block, with a local stack";
        break;
      }
      case "ConditionalToken": {
        markdown =
          "Conditional - if top stack item is true, then run the following";
        break;
      }
      case "UseToken": {
        markdown =
          "Pop and use the top item on the stack as the top stack item";
        break;
      }
      case "LabelToken": {
        markdown = "A labelled stack";
        break;
      }
    }

    if (markdown === null) {
      return;
    }

    return {
      contents: markdown,
    };
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

/**
 * In theory, this is where you provide a way for jumping to a particular
 * reference
 */
connection.onDefinition(
  async (params: DefinitionParams): Promise<DefinitionLink[]> => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    return [];
  }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

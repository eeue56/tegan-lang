import * as path from "path";
import * as vscode from "vscode";
import { ExtensionContext, workspace } from "vscode";
import { generateTegan } from "../../src/generate";
import { parseProgramWithComments } from "../../src/parser";
import { mapStringIndexToCharacterAndLine, tokenize } from "../../src/tokenize";
import { Token } from "../../src/types";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

/**
 * The list of token types that VSCode uses for Semantic Tokens
 */
const tokenTypesLegend = [
  "comment",
  "string",
  "keyword",
  "number",
  "operator",
  "function",
  "macro",
  "label",
  "ignore",
] as const;

const legend = new vscode.SemanticTokensLegend(
  tokenTypesLegend.slice(0, tokenTypesLegend.length)
);

// for writing debug messages, etc
const channel = vscode.window.createOutputChannel("TeganLang");

/**
 * Triggered when an extension is activated, then starts the LSP client
 */
export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "tegan-lang" },
      new DocumentSemanticTokensProvider(),
      legend
    )
  );

  try {
    await activateLspClient(context);
  } catch (e) {
    channel.appendLine(`Error, ${e}`);
  }

  /**
   * Create a terminal when needed, then reuse it
   */
  let terminal: vscode.Terminal | null = null;

  vscode.commands.registerCommand(
    "teganLanguageServer.runCurrentFile",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      const doc = activeEditor?.document;

      if (!doc) {
        return;
      }

      await doc.save();

      // Reuse terminal
      if (!terminal) {
        terminal = vscode.window.createTerminal(`Run ${doc.fileName}`);
      }
      terminal.show();

      terminal.sendText(`ts-node src/main.ts ${doc.fileName}`);
    }
  );

  /**
   * When a file is saved
   */
  vscode.commands.registerCommand("extension.format-tegan", () => {
    const { activeTextEditor } = vscode.window;

    if (
      activeTextEditor &&
      activeTextEditor.document.languageId === "tegan-lang"
    ) {
      const { document } = activeTextEditor;

      const text = document.getText();

      // we want to preserve comments, whitespace, etc
      const parsed = parseProgramWithComments(text);

      // if there's errors when parsing, don't modify the file
      // otherwise it becomes messy
      if (parsed.errors.length > 0) {
        return;
      }

      const outputTegan = generateTegan(parsed);

      // only write if files are formatted differently
      if (text === outputTegan) return;

      const range = new vscode.Range(
        0,
        0,
        activeTextEditor.document.lineCount,
        0
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, outputTegan);
      return vscode.workspace.applyEdit(edit);
    }
  });

  /**
   * When formatting is specifically requested
   */
  vscode.languages.registerDocumentFormattingEditProvider(
    { language: "tegan-lang" },
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): vscode.TextEdit[] {
        const text = document.getText();
        const parsed = parseProgramWithComments(text);

        if (parsed.errors.length > 0) {
          return [];
        }

        const outputTegan = generateTegan(parsed);

        // only write if files are formatted differently
        if (text === outputTegan) return [];

        const range = new vscode.Range(0, 0, document.lineCount, 0);

        return [vscode.TextEdit.replace(range, outputTegan)];
      },
    }
  );
}

type VsCodeToken = {
  kind: (typeof tokenTypesLegend)[number];
  line: number;
  start: number;
  length: number;
};

/**
 * Map our Tegan token types to VSCode types
 */
function tokenKindToVsCodeTokenType(
  kind: Token["kind"]
): (typeof tokenTypesLegend)[number] {
  switch (kind) {
    case "PushToStackToken": {
      return "operator";
    }
    case "NameToken": {
      return "function";
    }
    case "NumberToken": {
      return "number";
    }
    case "StringToken": {
      return "string";
    }
    case "WhitespaceToken": {
      return "ignore";
    }
    case "NewlineToken": {
      return "ignore";
    }
    case "IntoToken": {
      return "operator";
    }
    case "CommentToken": {
      return "comment";
    }
    case "OutroToken": {
      return "operator";
    }
    case "ConditionalToken": {
      return "operator";
    }
    case "UseToken": {
      return "operator";
    }
    case "LabelToken": {
      return "operator";
    }
  }
}

function tokenToVsCodeToken(token: Token, str: string): VsCodeToken {
  return {
    kind: tokenKindToVsCodeTokenType(token.kind),
    ...mapStringIndexToCharacterAndLine(str, token.startIndex, token.endIndex),
  };
}

/**
 * Provides semantic aware syntax highlighting
 */
class DocumentSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  async provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.SemanticTokens> {
    const text = document.getText();
    const allTokens = this._parseText(text);

    const builder = new vscode.SemanticTokensBuilder(legend);

    for (const teganToken of allTokens) {
      const token = tokenToVsCodeToken(teganToken, text);
      if (token.kind === "ignore") {
        continue;
      }
      builder.push(
        token.line,
        token.start,
        token.length,
        tokenTypesLegend.indexOf(token.kind)
      );
    }
    return builder.build();
  }

  private _parseText(text: string): Token[] {
    return tokenize(text);
  }
}

let client: LanguageClient;

async function activateLspClient(context: ExtensionContext) {
  channel.appendLine("Activating LSP client...");

  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "tegan-lang" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  client = new LanguageClient(
    "teganLanguageServer",
    "Tegan Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client + server
  await client.start();

  channel.appendLine("Started!");
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

import { Token } from "./types";

type WhitespaceChar = " ";
function isWhitespaceChar(char: string): char is WhitespaceChar {
  return char === " ";
}

type NewlineChar = "\n";
function isNewlineChar(char: string): char is NewlineChar {
  return char === "\n";
}

type StringQuoteChar = '"';
function isStringQuoteChar(char: string): char is StringQuoteChar {
  return char === '"';
}

type IntoChar = "<" | "-";
function isIntoChar(char: string): char is IntoChar {
  return char === "<" || char === "-";
}

type OutroChar = "^" | "-";
function isOutroChar(char: string): char is OutroChar {
  return char === "^" || char === "-";
}

type NumberChar = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0";
function isNumberChar(char: string): char is NumberChar {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].includes(char);
}

type CommentBeginChar = "%";
function isCommentBeginChar(char: string): char is CommentBeginChar {
  return char === "%";
}

type ConditionalChar = "?";
function isConditionalChar(char: string): char is ConditionalChar {
  return char === "?";
}

type UseChar = "@";
function isUseChar(char: string): char is UseChar {
  return char === "@";
}

type LabelChar = ">" | "=";
function isLabelChar(char: string): char is LabelChar {
  return char === ">" || char === "=";
}

type TokenizerState =
  | { kind: "ReadyForNextToken" }
  | { kind: "ReadPushToStack"; startIndex: number }
  | { kind: "ReadConditional"; startIndex: number }
  | { kind: "ReadNewline"; startIndex: number }
  | { kind: "ReadingNumber"; numberSoFar: NumberChar[]; startIndex: number }
  | { kind: "ReadingString"; stringSoFar: string[]; startIndex: number }
  | { kind: "ReadingName"; nameSoFar: string[]; startIndex: number }
  | { kind: "ReadingInto"; intoSoFar: IntoChar[]; startIndex: number }
  | { kind: "ReadingOutro"; outroSoFar: OutroChar[]; startIndex: number }
  | {
      kind: "ReadingWhitespace";
      whitespaceSoFar: WhitespaceChar[];
      startIndex: number;
    }
  | { kind: "ReadingComment"; commentSoFar: string[]; startIndex: number }
  | { kind: "ReadUse"; startIndex: number }
  | { kind: "ReadingLabel"; startIndex: number; labelSoFar: LabelChar[] };

export function tokenize(str: string): Token[] {
  let state: TokenizerState = { kind: "ReadyForNextToken" };
  const tokens: Token[] = [];

  function setState(
    currentState: TokenizerState,
    newState: TokenizerState
  ): void {
    const isStateChange = currentState.kind !== newState.kind;

    if (!isStateChange) {
      state = newState;
      return;
    }

    switch (currentState.kind) {
      case "ReadyForNextToken": {
        break;
      }
      case "ReadPushToStack": {
        tokens.push({
          kind: "PushToStackToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + 1,
        });
        break;
      }
      case "ReadConditional": {
        tokens.push({
          kind: "ConditionalToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + 1,
        });
        break;
      }
      case "ReadNewline": {
        break;
      }
      case "ReadUse": {
        tokens.push({
          kind: "UseToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + 1,
        });
        break;
      }
      case "ReadingNumber": {
        tokens.push({
          kind: "NumberToken",
          value: parseInt(currentState.numberSoFar.join(""), 10),
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + currentState.numberSoFar.length,
        });
        break;
      }
      case "ReadingName": {
        tokens.push({
          kind: "NameToken",
          value: currentState.nameSoFar.join(""),
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + currentState.nameSoFar.length,
        });
        break;
      }
      case "ReadingInto": {
        tokens.push({
          kind: "IntoToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + currentState.intoSoFar.length,
        });
        break;
      }
      case "ReadingOutro": {
        tokens.push({
          kind: "OutroToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + currentState.outroSoFar.length,
        });
        break;
      }
      case "ReadingLabel": {
        tokens.push({
          kind: "LabelToken",
          startIndex: currentState.startIndex,
          endIndex: currentState.startIndex + currentState.labelSoFar.length,
        });
        break;
      }
      case "ReadingWhitespace": {
        tokens.push({
          kind: "WhitespaceToken",
          value: currentState.whitespaceSoFar.join(""),
          startIndex: currentState.startIndex,
          endIndex:
            currentState.startIndex + currentState.whitespaceSoFar.length,
        });
        break;
      }
      case "ReadingComment": {
        tokens.push({
          kind: "CommentToken",
          value: currentState.commentSoFar.join(""),
          startIndex: currentState.startIndex,
          endIndex:
            currentState.startIndex + currentState.commentSoFar.length + 1,
        });
        break;
      }
      case "ReadingString": {
        tokens.push({
          kind: "StringToken",
          value: currentState.stringSoFar.join(""),
          startIndex: currentState.startIndex,
          endIndex:
            currentState.startIndex + currentState.stringSoFar.length + 2,
        });
        break;
      }
    }

    state = newState;
  }

  for (let index = 0; index <= str.length; index++) {
    const char = str[index];
    state = state as TokenizerState;

    if (typeof char === "undefined") {
      setState(state, { kind: "ReadyForNextToken" });
      break;
    }

    if (isNewlineChar(char)) {
      setState(state, { kind: "ReadNewline", startIndex: index });
      tokens.push({
        kind: "NewlineToken",
        startIndex: index,
        endIndex: index + 1,
      });
      continue;
    }

    if (state.kind === "ReadingComment") {
      setState(state, {
        kind: "ReadingComment",
        commentSoFar: [...state.commentSoFar, char],
        startIndex: state.startIndex,
      });

      continue;
    }

    if (state.kind === "ReadingString" && !isStringQuoteChar(char)) {
      setState(state, {
        kind: "ReadingString",
        stringSoFar: [...state.stringSoFar, char],
        startIndex: state.startIndex,
      });
      continue;
    }

    if (char === "#") {
      setState(state, { kind: "ReadPushToStack", startIndex: index });
    } else if (isConditionalChar(char)) {
      setState(state, { kind: "ReadConditional", startIndex: index });
    } else if (isUseChar(char)) {
      setState(state, { kind: "ReadUse", startIndex: index });
    } else if (isStringQuoteChar(char)) {
      if (state.kind === "ReadingString") {
        setState(state, {
          kind: "ReadyForNextToken",
        });
      } else {
        setState(state, {
          kind: "ReadingString",
          stringSoFar: [],
          startIndex: index,
        });
      }
    } else if (isNumberChar(char)) {
      if (state.kind === "ReadingNumber") {
        setState(state, {
          kind: "ReadingNumber",
          numberSoFar: [...state.numberSoFar, char],
          startIndex: state.startIndex,
        });
      } else {
        setState(state, {
          kind: "ReadingNumber",
          numberSoFar: [char],
          startIndex: index,
        });
      }
    } else if (isWhitespaceChar(char)) {
      if (state.kind === "ReadingWhitespace") {
        setState(state, {
          kind: "ReadingWhitespace",
          whitespaceSoFar: [...state.whitespaceSoFar, char],
          startIndex: state.startIndex,
        });
      } else {
        setState(state, {
          kind: "ReadingWhitespace",
          whitespaceSoFar: [char],
          startIndex: index,
        });
      }
    } else if (char === "-") {
      if (state.kind === "ReadingInto") {
        setState(state, {
          kind: "ReadingInto",
          intoSoFar: [...state.intoSoFar, char],
          startIndex: state.startIndex,
        });
      } else if (state.kind === "ReadingOutro") {
        setState(state, {
          kind: "ReadingOutro",
          outroSoFar: [...state.outroSoFar, char],
          startIndex: state.startIndex,
        });
      }
    } else if (isIntoChar(char)) {
      setState(state, {
        kind: "ReadingInto",
        intoSoFar: [char],
        startIndex: index,
      });
    } else if (isOutroChar(char)) {
      setState(state, {
        kind: "ReadingOutro",
        outroSoFar: [char],
        startIndex: index,
      });
    } else if (isLabelChar(char)) {
      if (state.kind === "ReadingLabel") {
        setState(state, {
          kind: "ReadingLabel",
          labelSoFar: [...state.labelSoFar, char],
          startIndex: index,
        });
      } else {
        setState(state, {
          kind: "ReadingLabel",
          labelSoFar: [char],
          startIndex: index,
        });
      }
    } else if (isCommentBeginChar(char)) {
      setState(state, {
        kind: "ReadingComment",
        commentSoFar: [],
        startIndex: index,
      });
    } else {
      if (state.kind === "ReadingName") {
        setState(state, {
          kind: "ReadingName",
          nameSoFar: [...state.nameSoFar, char],
          startIndex: state.startIndex,
        });
      } else {
        setState(state, {
          kind: "ReadingName",
          nameSoFar: [char],
          startIndex: index,
        });
      }
    }
  }
  return tokens;
}

/**
 * Generates a version of a token to be used in error messages
 */
export function errorMessage(token: Token): string {
  switch (token.kind) {
    case "PushToStackToken": {
      return "#";
    }
    case "NameToken": {
      return `${token.value}`;
    }
    case "NumberToken": {
      return `${token.value}`;
    }
    case "StringToken": {
      return `"${token.value}"`;
    }
    case "WhitespaceToken": {
      return `<${token.value}>`;
    }
    case "NewlineToken": {
      return `<newline>`;
    }
    case "IntoToken": {
      return `<-`;
    }
    case "CommentToken": {
      return `%`;
    }
    case "OutroToken": {
      return `^-`;
    }
    case "ConditionalToken": {
      return `?`;
    }
    case "UseToken": {
      return `@`;
    }
    case "LabelToken": {
      return `=>`;
    }
  }
}

/**
 * Turn a string index into line + index for VSCode
 * @param str the original string
 * @param index the start index in the string
 * @param end the end index in the string
 * @returns a start, length, and line number
 */
export function mapStringIndexToCharacterAndLine(
  str: string,
  index: number,
  end: number
): { start: number; length: number; line: number } {
  const lines = str.split("\n");
  const line = [...str.slice(0, index)].filter((char) => char === "\n").length;
  const beforeThisLine = lines.slice(0, line).join("\n");
  const start =
    index - (line > 0 ? beforeThisLine.length + 1 : beforeThisLine.length);
  const length = end - index;

  return {
    start,
    length,
    line,
  };
}

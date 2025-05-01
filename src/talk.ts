import {
  Expression,
  FunctionCallExpression,
  NameToken,
  NumberToken,
  PushToStackExpression,
  PushToStackToken,
  Token,
} from "./types";

/**
 * This file is a sketchpad for a minimal parser.
 */

type WhitespaceChar = " ";

type NumberChar = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0";

function isNumberChar(char: string): char is NumberChar {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].includes(char);
}

type CommentBeginChar = "%";

function isCommentBeginChar(char: string): char is CommentBeginChar {
  return char === "%";
}

const alphabet = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
] as const;

type NameChar = (typeof alphabet)[number];

function isNameChar(char: string): char is NameChar {
  return alphabet.includes(char as NameChar);
}

type State =
  | { kind: "Ready" }
  | { kind: "ReadingWhitespace"; buffer: WhitespaceChar[]; startIndex: number }
  | { kind: "ReadingNumber"; buffer: NumberChar[]; startIndex: number }
  | { kind: "ReadingComment"; buffer: string[]; startIndex: number }
  | { kind: "ReadingName"; buffer: string[]; startIndex: number }
  | { kind: "ReadPushToStack"; startIndex: number };

function mergeStates(oldState: State, newState: State): State {
  if (oldState.kind !== newState.kind) {
    return newState;
  }
  switch (oldState.kind) {
    case "Ready":
    case "ReadPushToStack": {
      return newState;
    }
    case "ReadingName":
    case "ReadingWhitespace":
    case "ReadingComment":
    case "ReadingNumber": {
      return {
        ...oldState,
        buffer: [...oldState.buffer, ...(newState as any).buffer],
      };
    }
  }
}

function stateTransition(oldState: State): Token[] {
  switch (oldState.kind) {
    case "Ready": {
      return [];
    }
    case "ReadingWhitespace": {
      return [
        {
          kind: "WhitespaceToken",
          value: oldState.buffer.join(""),
          startIndex: oldState.startIndex,
          endIndex: oldState.startIndex + oldState.buffer.length,
        },
      ];
    }
    case "ReadingNumber": {
      return [
        {
          kind: "NumberToken",
          value: parseInt(oldState.buffer.join(""), 10),
          startIndex: oldState.startIndex,
          endIndex: oldState.startIndex + oldState.buffer.length,
        },
      ];
    }
    case "ReadingComment": {
      return [
        {
          kind: "CommentToken",
          value: oldState.buffer.join(""),
          startIndex: oldState.startIndex,
          endIndex: oldState.startIndex + oldState.buffer.length,
        },
      ];
    }
    case "ReadPushToStack": {
      return [
        {
          kind: "PushToStackToken",
          startIndex: oldState.startIndex,
          endIndex: oldState.startIndex + 1,
        },
      ];
    }
    case "ReadingName": {
      return [
        {
          kind: "NameToken",
          startIndex: oldState.startIndex,
          endIndex: oldState.startIndex + oldState.buffer.length,
          value: oldState.buffer.join(""),
        },
      ];
    }
  }
}

function tokenize(str: string): Token[] {
  let state: State = { kind: "Ready" };
  let currentIndex = 0;
  const tokens: Token[] = [];

  function setState(oldState: State, newState: State): State {
    if (oldState.kind === newState.kind) {
      return mergeStates(oldState, newState);
    } else {
      state = mergeStates(oldState, newState);
      for (const token of stateTransition(oldState)) {
        tokens.push(token);
      }
      return state;
    }
  }

  for (const char of str) {
    switch (state.kind) {
      case "ReadingComment": {
        if (char === "\n") {
          state = setState(state, { kind: "Ready" });
        } else {
          state = setState(state, {
            kind: "ReadingComment",
            buffer: [char],
            startIndex: currentIndex,
          });
        }
        currentIndex++;
        continue;
      }
    }

    if (isNumberChar(char)) {
      state = setState(state, {
        kind: "ReadingNumber",
        buffer: [char],
        startIndex: currentIndex,
      });
    } else if (isCommentBeginChar(char)) {
      state = setState(state, {
        kind: "ReadingComment",
        buffer: [],
        startIndex: currentIndex,
      });
    } else if (char === "#") {
      state = setState(state, {
        kind: "ReadPushToStack",
        startIndex: currentIndex,
      });
    } else if (isNameChar(char)) {
      state = setState(state, {
        kind: "ReadingName",
        startIndex: currentIndex,
        buffer: [char],
      });
    } else if (char === " ") {
      state = setState(state, {
        kind: "ReadingWhitespace",
        startIndex: currentIndex,
        buffer: [char],
      });
    }
    currentIndex++;
  }

  for (const token of stateTransition(state)) {
    tokens.push(token);
  }

  return tokens;
}

console.log(tokenize("# 10 % push\nprint\n"));
// outputs:
[
  { kind: "PushToStackToken", startIndex: 0, endIndex: 1 },
  { kind: "WhitespaceToken", value: " ", startIndex: 1, endIndex: 2 },
  { kind: "NumberToken", value: 10, startIndex: 2, endIndex: 4 },
  { kind: "WhitespaceToken", value: " ", startIndex: 4, endIndex: 5 },
  { kind: "CommentToken", value: " push", startIndex: 5, endIndex: 10 },
  { kind: "NameToken", startIndex: 12, endIndex: 17, value: "print" },
];

type Result<value> =
  | { kind: "Ok"; value: value; tokensUsed: number }
  | { kind: "Err"; regionStart: number; regionEnd: number; message: string };

function parsePushToStack(tokens: Token[]): Result<PushToStackExpression> {
  if (tokens.length < 2)
    return {
      kind: "Err",
      regionStart: -999,
      regionEnd: -999,
      message: "Not enough tokens to parse push to stack",
    };
  if (
    tokens[0].kind === "PushToStackToken" &&
    tokens[1].kind === "NumberToken"
  ) {
    return {
      kind: "Ok",
      value: {
        kind: "PushToStackExpression",
        value: { kind: "TeganNumberExpression", value: tokens[1].value },
        namedStack: null,
      },
      tokensUsed: 2,
    };
  }
  return {
    kind: "Err",
    regionStart: tokens[0].startIndex,
    regionEnd: tokens[1].endIndex,
    message: `Expected push to stack but got [${tokens[0].kind}, ${tokens[1].kind}]`,
  };
}

function parseFunctionCall(tokens: Token[]): Result<FunctionCallExpression> {
  if (tokens.length < 1) {
    return {
      kind: "Err",
      regionStart: -999,
      regionEnd: -999,
      message: "Not enough tokens to parse function call ",
    };
  }

  if (tokens[0].kind === "NameToken") {
    return {
      kind: "Ok",
      value: {
        kind: "FunctionCallExpression",
        functionName: tokens[0].value,
        namedStack: null,
      },
      tokensUsed: 1,
    };
  }

  return {
    kind: "Err",
    regionStart: tokens[0].startIndex,
    regionEnd: tokens[0].endIndex,
    message: `Expected push to stack but got [${tokens[0].kind}]`,
  };
}

type ExpressionToken = NameToken | NumberToken | PushToStackToken;

function parseExpressions(tokens: ExpressionToken[]): Expression[] {
  let currentIndex = 0;
  const expressions: Expression[] = [];

  while (currentIndex < tokens.length) {
    const headToken = tokens[currentIndex];
    let result = null;

    switch (headToken.kind) {
      case "NameToken": {
        result = parseFunctionCall(tokens.slice(currentIndex, tokens.length));
        break;
      }
      case "NumberToken": {
        console.error("Unexpected NumberToken", headToken.value);
        currentIndex++;
      }
      case "PushToStackToken": {
        result = parsePushToStack(tokens.slice(currentIndex, tokens.length));
      }
    }

    if (result === null) {
      continue;
    }

    if (result.kind === "Ok") {
      expressions.push(result.value);
    } else {
      console.error(result.message);
    }
    currentIndex++;
  }
  return expressions;
}

type Program = {
  kind: "Program";
  expressions: Expression[];
  errors: Error[];
};

function parseProgram(str: string): Program {
  throw new Error("TODO");
}

function generate(program: Program): string {
  throw new Error("TODO");
}

generate(parseProgram(""));

import { errorMessage, tokenize } from "./tokenize";
import {
  CommentExpression,
  CommentToken,
  ConditionalExpression,
  ConditionalToken,
  Expression,
  FunctionCallExpression,
  IntoToken,
  LabelToken,
  NameToken,
  NumberToken,
  OutroToken,
  Program,
  PushToStackExpression,
  PushToStackToken,
  StringToken,
  TeganNumberExpression,
  TeganStringExpression,
  Token,
  TokenKind,
  UseExpression,
  UseToken,
} from "./types";

/**
 * An error with a region to signify an error
 * at specific indexes of a string that was attempted to be parsed
 */
export type Err = {
  kind: "Err";
  message: string;
  regionStart: number;
  regionEnd: number;
};

/**
 * Every successful parsing result contains the value parsed,
 * and the number of tokens consumed to get the value
 *
 * For example, some syntax might have optional tokens.
 * Knowing the number of tokens consumed allows the parser to
 * move to the next token without doubly parsing
 */
type Ok<value> = { kind: "Ok"; value: value; tokensConsumed: number };

/**
 * A result from a parsing step - either success, or fail
 */
type ParseResult<value> = Ok<value> | Err;

/**
 * Checks if a token matches a particular type.
 *
 * Often the token will have a known `kind`, e.g "StringToken",
 * but not an value to match. By matching the `kind`, we avoid needing
 * to provide a specific object while remaining type safe.
 *
 * @param kind the token kind to match
 * @param token the token itself
 * @returns success if it matches, otherwise an error
 */
function expectOne<
  kind extends TokenKind,
  token extends Token & { kind: kind }
>(kind: kind, token: Token | undefined): ParseResult<token> {
  if (typeof token === "undefined") {
    return {
      kind: "Err",
      message: `Expected ${kind} but got no token`,
      regionStart: -999,
      regionEnd: -999,
    };
  }
  if (kind !== token.kind) {
    return {
      kind: "Err",
      message: `Expected ${kind} but got ${token.kind}, ${JSON.stringify(
        token
      )}`,
      regionStart: token.startIndex,
      regionEnd: token.endIndex,
    };
  }

  return { kind: "Ok", tokensConsumed: 1, value: token as token };
}

/**
 * Numbers look like:
 * 0 10 99 1999
 *
 * @param tokens all the remaining tokens that might be used
 * @returns the number expression if successful - 1 token consumed
 */
function parseNumber(tokens: Token[]): ParseResult<TeganNumberExpression> {
  const number = expectOne(
    "NumberToken",
    tokens[0]
  ) as ParseResult<NumberToken>;

  switch (number.kind) {
    case "Err": {
      return number;
    }
    case "Ok": {
      return {
        kind: "Ok",
        value: {
          kind: "TeganNumberExpression",
          value: number.value.value,
        },
        tokensConsumed: number.tokensConsumed,
      };
    }
  }
}

/**
 * Returns all the errors in a collection of results, otherwise null
 *
 * @param results a collection of results which may or may not contain errors
 * @returns a string of all errors joined by newlines
 */
function hasErrors(...results: ParseResult<any>[]): string | null {
  const errors: string[] = [];
  for (const result of results) {
    if (result.kind === "Err") {
      errors.push(result.message);
    }
  }

  if (errors) {
    return errors.join("\n");
  }

  return null;
}

/**
 * `types` are each a specific version of a ParseResult, e.g -
 *
 * types = [ParseResult<string>, ParseResult<number>]
 *
 * This type extracts the expected type, in this case:
 *
 * [string, number]
 *
 * You could think of it as an equivilence of:
 *
 * ReturnSpecificValues<
 *  [ParseResult<string>, ParseResult<number]
 * > == [string, number]
 */
type ReturnSpecificValues<types> = {
  [key in keyof types]: types[key] extends ParseResult<infer value>
    ? value
    : undefined;
};

/**
 * `types` are each a specific version of a parse function
 * that returns a ParseResult, e.g -
 *
 * types = [
 *  (tokens: Token[]) => ParseResult<string>,
 *  (tokens: Token[]) => ParseResult<number>
 * ]
 *
 * This type extracts the expected type, in this case:
 *
 * [string, number]
 *
 * You could think of it as an equivilence of:
 *
 * ReturnSpecificValues<
 *  [
 *    (tokens: Token[]) => ParseResult<string>,
 *    (tokens: Token[]) => ParseResult<number>
 *  ]
 * > == [string, number]
 */
type ReturnSpecificValuesFromCallback<types> = {
  [key in keyof types]: types[key] extends (
    tokens: Token[]
  ) => ParseResult<infer value>
    ? value
    : undefined;
};

/**
 * Extracts all successful values from the given parse results
 *
 * @param results
 * @returns an array of successful parsed values,
 *          with undefined items if unsucessful
 */
function values<types extends ParseResult<unknown>[]>(
  ...results: types
): ReturnSpecificValues<types> {
  return results.map((arg) =>
    arg.kind === "Ok" ? arg.value : undefined
  ) as ReturnSpecificValues<types>;
}

/**
 * Given a list of parsers, return the first successful parse attempt
 * on the tokens. If none succeed, return an unsuccessful parsing result.
 *
 * @param tokens
 * @param parsers
 * @returns
 */
function oneOf<types extends ((tokens: Token[]) => ParseResult<unknown>)[]>(
  tokens: Token[],
  ...parsers: types
): ParseResult<ReturnSpecificValuesFromCallback<types>[number]> {
  const errorMessages: string[] = [];
  let lowestStart = 9999999;
  let lowestEnd = 9999999;

  for (const parser of parsers) {
    const minTokens = MIN_TOKENS_BY_PARSER_NAME[parser.name] || 0;
    if (tokens.length < minTokens) {
      errorMessages.push(`Too few tokens to parse ${parser.name}`);
      continue;
    }
    const result = parser(tokens);
    if (result.kind === "Ok") {
      return result as ParseResult<
        ReturnSpecificValuesFromCallback<types>[number]
      >;
    }
    errorMessages.push(result.message);
    lowestStart = result.regionStart;
    lowestEnd = result.regionEnd;
  }

  return {
    kind: "Err",
    message: `No matching oneOf: ${errorMessages.join("\n")}`,
    regionStart: lowestStart,
    regionEnd: lowestEnd,
  };
}

function parseLabel(tokens: Token[]): ParseResult<NameToken> {
  if (tokens.length < 2) {
    return {
      kind: "Err",
      message: "",
      regionStart: -999,
      regionEnd: -999,
    };
  }
  const labelToken = expectOne(
    "LabelToken",
    tokens[0]
  ) as ParseResult<LabelToken>;
  const name = expectOne("NameToken", tokens[1]) as ParseResult<NameToken>;

  const errors = hasErrors(labelToken, name);

  if (errors) {
    return {
      kind: "Err",
      message: errors,
      regionStart: tokens[0]?.startIndex || -1,
      regionEnd: tokens[1].endIndex || -1,
    };
  }

  const [_, label]: [LabelToken, NameToken] = values(labelToken, name);

  return {
    kind: "Ok",
    value: label,
    tokensConsumed: 2,
  };
}

function parsePushToStack(tokens: Token[]): ParseResult<PushToStackExpression> {
  const push = expectOne(
    "PushToStackToken",
    tokens[0]
  ) as ParseResult<PushToStackToken>;
  const number = parseNumber([tokens[1]]);
  const string = parseString([tokens[1]]);

  if (hasErrors(number) && hasErrors(string)) {
    return {
      kind: "Err",
      message: "Expected a number or a string",
      regionStart: tokens[1].startIndex,
      regionEnd: tokens[1].endIndex,
    };
  }

  const numberOrString = hasErrors(number) ? string : number;

  const errors = hasErrors(push, numberOrString);

  if (errors) {
    return {
      kind: "Err",
      message: errors,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const results = values(push, numberOrString);

  const maybeLabel = parseLabel(tokens.slice(2, tokens.length));
  const label = maybeLabel.kind === "Ok" ? maybeLabel.value.value : null;
  const labelLength = maybeLabel.kind === "Ok" ? maybeLabel.tokensConsumed : 0;

  return {
    kind: "Ok",
    value: {
      kind: "PushToStackExpression",
      value: results[1],
      namedStack: label,
    },
    tokensConsumed: 2 + labelLength,
  };
}

/**
 * A function that generically represents not enough tokens for a parsing attempt.
 *
 * @returns A parsing error
 */
function NotEnoughTokens<a>(): ParseResult<a> {
  return {
    kind: "Err",
    message: "Not enough tokens",
    regionStart: -777,
    regionEnd: -777,
  };
}

function parseFunctionCall(
  tokens: Token[]
): ParseResult<FunctionCallExpression> {
  if (tokens.length < MIN_TOKENS["NameToken"]) {
    return NotEnoughTokens();
  }
  const name = expectOne("NameToken", tokens[0]) as ParseResult<NameToken>;
  const errors = hasErrors(name);

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse name, ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [token] = values(name);

  const maybeLabel = parseLabel(tokens.slice(1, tokens.length));
  const label = maybeLabel.kind === "Ok" ? maybeLabel.value.value : null;
  const labelLength = maybeLabel.kind === "Ok" ? maybeLabel.tokensConsumed : 0;

  return {
    kind: "Ok",
    value: {
      kind: "FunctionCallExpression",
      functionName: token.value,
      namedStack: label,
    },
    tokensConsumed: 1 + labelLength,
  };
}

function untilToken(tokens: Token[], kind: TokenKind): Token[] {
  return tokens.slice(
    0,
    tokens.findIndex((token) => token.kind === kind)
  );
}

function parseInto(tokens: Token[]): ParseResult<Expression> {
  const functionCall = parseFunctionCall(tokens.slice(0, tokens.length));
  const into = expectOne("IntoToken", tokens[1]) as ParseResult<IntoToken>;
  const insideBlock = untilToken(tokens.slice(2, tokens.length), "OutroToken");
  const outro = expectOne(
    "OutroToken",
    tokens[2 + insideBlock.length]
  ) as ParseResult<OutroToken>;

  const miniProgram = parseExpressions(insideBlock);

  const errors =
    hasErrors(into, functionCall, outro) ||
    miniProgram.errors.map((err) => err.message).join("\n");

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse into block: ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [call]: [FunctionCallExpression] = values(functionCall);

  return {
    kind: "Ok",
    value: {
      kind: "LocalBlockExpression",
      values: miniProgram.expressions,
      baseCall: call,
    },
    tokensConsumed: 2 + insideBlock.length + 1,
  };
}

function parseString(tokens: Token[]): ParseResult<TeganStringExpression> {
  if (tokens.length < MIN_TOKENS["StringToken"]) {
    return NotEnoughTokens();
  }
  const maybeString = expectOne(
    "StringToken",
    tokens[0]
  ) as ParseResult<StringToken>;

  const errors = hasErrors(maybeString);

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse into block: ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [string]: [StringToken] = values(maybeString);

  return {
    kind: "Ok",
    value: {
      kind: "TeganStringExpression",
      value: string.value,
    },
    tokensConsumed: 1,
  };
}

function parseConditional(tokens: Token[]): ParseResult<ConditionalExpression> {
  const conditional = expectOne(
    "ConditionalToken",
    tokens[0]
  ) as ParseResult<ConditionalToken>;

  const namePushOrUse = oneOf(
    tokens.slice(1, tokens.length),
    parseFunctionCall,
    parseUse,
    parsePushToStack
  );

  const errors = hasErrors(conditional, namePushOrUse);

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse conditional block: ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [_, subExpression]: [
    ConditionalToken,
    FunctionCallExpression | UseExpression | PushToStackExpression
  ] = values(conditional, namePushOrUse);

  const subLength =
    namePushOrUse.kind === "Ok" ? namePushOrUse.tokensConsumed : 0;

  const maybeLabel = parseLabel(tokens.slice(2, tokens.length));
  const label = maybeLabel.kind === "Ok" ? maybeLabel.value.value : null;
  const labelLength = maybeLabel.kind === "Ok" ? maybeLabel.tokensConsumed : 0;

  return {
    kind: "Ok",
    value: {
      kind: "ConditionalExpression",
      value: subExpression,
      namedStack: label,
    },
    tokensConsumed: 1 + subLength + labelLength,
  };
}

function parseUse(tokens: Token[]): ParseResult<UseExpression> {
  const use = expectOne("UseToken", tokens[0]) as ParseResult<UseToken>;
  const name = parseFunctionCall(tokens.slice(1, tokens.length));

  const errors = hasErrors(use, name);

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse conditional block: ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [_, functionCall]: [UseToken, FunctionCallExpression] = values(
    use,
    name
  );

  const maybeLabel = parseLabel(tokens.slice(2, tokens.length));
  const label = maybeLabel.kind === "Ok" ? maybeLabel.value.value : null;
  const labelLength = maybeLabel.kind === "Ok" ? maybeLabel.tokensConsumed : 0;

  return {
    kind: "Ok",
    value: {
      kind: "UseExpression",
      functionName: functionCall,
      namedStack: label,
    },
    tokensConsumed: 1 + 1 + labelLength,
  };
}

function parseComment(tokens: Token[]): ParseResult<CommentExpression> {
  const commentResult = expectOne(
    "CommentToken",
    tokens[0]
  ) as ParseResult<CommentToken>;

  const errors = hasErrors(commentResult);

  if (errors) {
    return {
      kind: "Err",
      message: `Failed to parse conditional block: ${errors}`,
      regionStart: tokens[0].startIndex,
      regionEnd: tokens[0].endIndex,
    };
  }

  const [comment]: [CommentToken] = values(commentResult);

  return {
    kind: "Ok",
    value: {
      kind: "CommentExpression",
      comment: comment.value,
    },
    tokensConsumed: 1,
  };
}

/**
 * We don't use Whitespace, Newlines, Outros, or Labels when parsing
 */
type TokenKindToParse = Exclude<
  TokenKind,
  "WhitespaceToken" | "NewlineToken" | "OutroToken" | "LabelToken"
>;

/**
 * A type that represents all the minimum tokens needed to parse each expression
 */
type MinTokenMap = {
  [Key in TokenKindToParse]: number;
};

/**
 * A type that represents a parser for each Expression
 */
type ParserMap = {
  [Key in TokenKindToParse]: (tokens: Token[]) => ParseResult<Expression>;
};

type MinTokenParserNameMap = {
  [ParserName: string]: number;
};

const MIN_TOKENS: MinTokenMap = {
  PushToStackToken: 2,
  NameToken: 1,
  NumberToken: 1,
  IntoToken: 3,
  StringToken: 1,
  ConditionalToken: 2,
  UseToken: 2,
  CommentToken: 1,
};

const PARSERS: ParserMap = {
  PushToStackToken: parsePushToStack,
  NameToken: parseFunctionCall,
  NumberToken: parseNumber,
  IntoToken: parseInto,
  StringToken: parseString,
  ConditionalToken: parseConditional,
  UseToken: parseUse,
  CommentToken: parseComment,
};

const MIN_TOKENS_BY_PARSER_NAME: MinTokenParserNameMap = Object.fromEntries(
  (Object.entries(MIN_TOKENS) as [TokenKindToParse, number][]).map(
    ([token, count]: [TokenKindToParse, number]) => {
      return [PARSERS[token].name, count];
    }
  )
);

function parseExpressions(tokens: Token[]): Program {
  const program: Program = {
    kind: "Program",
    errors: [],
    expressions: [],
    tokens: tokens.slice(0, tokens.length),
    overallError: "",
  };
  let previousIndex = -1;
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i];
    const nextToken = tokens[i + 1];
    if (previousIndex === i) {
      program.errors.push({
        kind: "Err",
        message: `Got stuck in an infinite loop at token ${i}, ${errorMessage(
          token
        )}`,
        regionStart: token.startIndex,
        regionEnd: token.endIndex,
      });
      break;
    }

    previousIndex = i;

    let parserToUse = PARSERS[token.kind as TokenKindToParse];
    let minTokens: number = MIN_TOKENS[token.kind as TokenKindToParse];
    if (nextToken && nextToken.kind === "IntoToken") {
      parserToUse = PARSERS["IntoToken"];
      minTokens = MIN_TOKENS["IntoToken"];
    }

    if (!parserToUse) {
      program.errors.push({
        kind: "Err",
        message: `Unexpected token \`${errorMessage(
          token
        )}\`, no idea what to do with it`,
        regionStart: i,
        regionEnd: token.endIndex,
      });
      break;
    }

    if (tokens.slice(i, tokens.length).length < minTokens) {
      program.errors.push({
        kind: "Err",
        message: `Not enough tokens remaining to parse \`${errorMessage(
          token
        )}\``,
        regionStart: token.startIndex,
        regionEnd: token.endIndex,
      });
      break;
    }

    const result = parserToUse(tokens.slice(i, tokens.length));

    switch (result.kind) {
      case "Err": {
        program.errors.push({
          ...result,
          message: `${parserToUse.name}: ${result.message}`,
        });
        i++;
        break;
      }
      case "Ok": {
        program.expressions.push(result.value);
        i += result.tokensConsumed;
        break;
      }
      default: {
        throw "wtf";
      }
    }
  }

  return program;
}

/**
 * Adds errors messages inline into the original string to display errors
 * right next to the problematic code.
 *
 * It uses red + underline terminal codes to highlight the error,
 * so this only makes sense in the terminal.
 *
 * @param str the original string given to the parser
 * @param errors the errors collected
 * @returns
 */
function inlineErrors(str: string, errors: Err[]): string {
  const underline = "\x1b[4;31m";
  const red = "\x1b[33m";
  const normalCode = "\x1b[0m";
  const reversedErrors = errors
    .slice(0, errors.length)
    .sort((first, second) => first.regionStart - second.regionStart)
    .reverse();
  for (const error of reversedErrors) {
    if (error.regionStart < 0 || error.regionEnd < 0) {
      continue;
    }
    const insertIndex = str.indexOf("\n", error.regionStart);
    let before = str.slice(0, insertIndex);
    before =
      before.slice(0, error.regionStart) +
      red +
      underline +
      before.slice(error.regionStart, error.regionEnd) +
      normalCode +
      before.slice(error.regionEnd, before.length);
    str =
      before +
      ` <= ${red}${error.message}${normalCode}` +
      str.slice(insertIndex, str.length);
  }
  return str;
}

export function parseProgram(str: string): Program {
  const tokens = tokenize(str);
  const program = parseExpressions(
    tokens.filter(
      (token) =>
        token.kind !== "WhitespaceToken" &&
        token.kind !== "CommentToken" &&
        token.kind !== "NewlineToken"
    )
  );

  if (program.errors) {
    program.overallError = inlineErrors(str, program.errors);
  }

  return program;
}

export function parseProgramWithComments(str: string): Program {
  const tokens = tokenize(str);
  const program = parseExpressions(
    tokens.filter(
      (token) =>
        token.kind !== "WhitespaceToken" && token.kind !== "NewlineToken"
    )
  );

  if (program.errors) {
    program.overallError = inlineErrors(str, program.errors);
  }

  return program;
}

// const example = `
// # 10
// print

// # 1
// # 9
// print <-
//     add @@ // add the top two values on the stack (9, 1)
//     sub _  // subtract the bottom value of the stack (10)
// ^------
// `;

// console.log(
//   tokenize(`
// # 10
// print

// print <- % print the local stack
//     # 30
// ^-------

// print
// `)
// );

// console.log(
//   parseProgram(`
// # 10
// print

// print <- % print the local stack
//     # 30
// ^-------

// print
// `)
// );

// console.log(JSON.stringify(parseProgram("@ top => counter"), null, 4));

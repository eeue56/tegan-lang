import { Err } from "./parser";

type TeganNumber = number;

type TeganString = string;

export type TeganNumberExpression = {
  kind: "TeganNumberExpression";
  value: TeganNumber;
};

export type TeganStringExpression = {
  kind: "TeganStringExpression";
  value: TeganString;
};

export type TeganValueExpression =
  | TeganNumberExpression
  | TeganStringExpression;

export type PushToStackExpression = {
  kind: "PushToStackExpression";
  value: TeganValueExpression;
  namedStack: string | null;
};

export type FunctionCallExpression = {
  kind: "FunctionCallExpression";
  functionName: string;
  namedStack: string | null;
};

export type LocalBlockExpression = {
  kind: "LocalBlockExpression";
  baseCall: FunctionCallExpression;
  values: Expression[];
};

export type ConditionalExpression = {
  kind: "ConditionalExpression";
  value: FunctionCallExpression | UseExpression | PushToStackExpression;
  namedStack: string | null;
};

export type UseExpression = {
  kind: "UseExpression";
  functionName: FunctionCallExpression;
  namedStack: string | null;
};

export type CommentExpression = {
  kind: "CommentExpression";
  comment: string;
};

export type Expression =
  | PushToStackExpression
  | FunctionCallExpression
  | LocalBlockExpression
  | TeganValueExpression
  | ConditionalExpression
  | UseExpression
  | CommentExpression;

type BaseToken = { startIndex: number; endIndex: number };

export type PushToStackToken = { kind: "PushToStackToken" } & BaseToken;

export type NameToken = { kind: "NameToken"; value: string } & BaseToken;

export type NumberToken = { kind: "NumberToken"; value: number } & BaseToken;

export type StringToken = { kind: "StringToken"; value: string } & BaseToken;

export type WhitespaceToken = {
  kind: "WhitespaceToken";
  value: string;
} & BaseToken;

export type NewlineToken = {
  kind: "NewlineToken";
} & BaseToken;

export type CommentToken = { kind: "CommentToken"; value: string } & BaseToken;

export type ConditionalToken = { kind: "ConditionalToken" } & BaseToken;

export type IntoToken = { kind: "IntoToken" } & BaseToken;

export type OutroToken = { kind: "OutroToken" } & BaseToken;

export type UseToken = { kind: "UseToken" } & BaseToken;

export type LabelToken = { kind: "LabelToken" } & BaseToken;

export type Token =
  | PushToStackToken
  | NameToken
  | NumberToken
  | StringToken
  | WhitespaceToken
  | NewlineToken
  | IntoToken
  | CommentToken
  | OutroToken
  | ConditionalToken
  | UseToken
  | LabelToken;

export type TokenKind = Token["kind"];

export type Program = {
  kind: "Program";
  expressions: Expression[];
  tokens: Token[];
  errors: Err[];
  overallError: string;
};

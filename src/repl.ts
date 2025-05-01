import { exit, stdin as input, stdout as output } from "process";
import * as readline from "readline";
import { generateExpression } from "./generate";
import { parseProgram } from "./parser";
import { BUILT_INS, runProgramFromState, State } from "./runtime";
import { Program } from "./types";

const REPL_STRINGS = [":quit", ":help", ":stacks"] as const;
type REPL_STRING = (typeof REPL_STRINGS)[number];

function isReplString(str: string): str is REPL_STRING {
  return REPL_STRINGS.includes(str as REPL_STRING);
}

/**
 * Special strings we use in the debugging repl to allow users to interact
 * with the debugger
 */
const DEBUG_STRINGS = [
  ":quit",
  ":help",
  ":next",
  ":continue",
  ":stacks",
] as const;

type DEBUG_STRING = (typeof DEBUG_STRINGS)[number];

function isDebugString(str: string): str is DEBUG_STRING {
  return DEBUG_STRINGS.includes(str as DEBUG_STRING);
}

type ReplMode = "Debug" | "Repl";

function createReadlineInterface(mode: ReplMode): readline.Interface {
  const rl = readline.createInterface({
    input,
    output,
    completer: (text: string): readline.CompleterResult =>
      completer(text, mode),
    tabSize: 4,
  });

  rl.prompt();

  rl.on("close", () => {});
  return rl;
}

/**
 * Given some text, return the possible strings that might be what the user
 * is trying to type
 * @param text the text a user has triggered auto-complete on
 * @returns a unique list of possible autocompletes
 */
function completer(text: string, replMode: ReplMode): readline.CompleterResult {
  const set = new Set(
    ...Object.keys(BUILT_INS).filter((func) => func.startsWith(text))
  );

  switch (replMode) {
    case "Debug": {
      for (const str of DEBUG_STRINGS) {
        if (str.startsWith(text)) {
          set.add(str);
        }
      }
      break;
    }
    case "Repl": {
      for (const str of REPL_STRINGS) {
        if (str.startsWith(text)) {
          set.add(str);
        }
      }
      break;
    }
  }

  return [[...set], text];
}

/**
 * Run a debug repl for a particular program, starting from a specific
 * expression
 * @param initialState the state when the debug session starts
 * @param program the program being debugged
 * @param currentExpressionIndex the index of the expression where the debugger started
 * @returns the state to resume from
 */
export async function debugRepl(
  initialState: State,
  program: Program,
  currentExpressionIndex: number
): Promise<{ state: State; currentExpressionIndex: number }> {
  // avoid the VIM :q problem
  console.log("Entering debug mode, :continue to exit");

  const rl = createReadlineInterface("Debug");

  let currentBuffer: string[] = [];
  let state: State = initialState;

  let linesAddedToCurrentBufferSinceLastParsing: string[] = [];

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (line.trim() === "") {
      const program = parseProgram(
        linesAddedToCurrentBufferSinceLastParsing.join("\n")
      );

      if (program.errors.length > 0) {
        console.log(`Errors while parsing: ${program.errors.join("\n")}`);
        linesAddedToCurrentBufferSinceLastParsing = [];
      } else {
        for (const newLine of linesAddedToCurrentBufferSinceLastParsing) {
          currentBuffer.push(newLine);
        }
        linesAddedToCurrentBufferSinceLastParsing = [];
        state = await runProgramFromState(program, state);
      }
    } else if (isDebugString(trimmedLine)) {
      switch (trimmedLine) {
        case ":quit": {
          rl.close();
          exit();
        }
        case ":help": {
          console.log("Enter some code, followed by a blank newline.");
        }
        case ":next": {
          console.log(
            `> ${generateExpression(
              program.expressions[currentExpressionIndex + 1]
            ).trim()}`
          );
          state = await runProgramFromState(
            {
              ...program,
              expressions: [program.expressions[currentExpressionIndex + 1]],
            },
            state
          );
          currentExpressionIndex++;
        }
        case ":continue": {
          rl.close();
          return { state, currentExpressionIndex };
        }
        case ":stacks": {
          console.log("Main stack:");
          for (const element of state.stack) {
            console.log(element);
          }
          console.table(state.namedStacks);
        }
      }
    } else {
      linesAddedToCurrentBufferSinceLastParsing.push(
        line.split("\t").join("    ")
      );
    }
    rl.prompt();
  }

  return { state, currentExpressionIndex };
}

/**
 * Runs the repl from some initial state. Usually the initial state is empty.
 * @param initialState
 * @returns the state when the repl exits
 */
export async function repl(initialState: State): Promise<State> {
  const rl = createReadlineInterface("Repl");

  let currentBuffer: string[] = [];
  let state: State = initialState;

  let linesAddedToCurrentBufferSinceLastParsing: string[] = [];

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (trimmedLine === "") {
      const program = parseProgram(
        linesAddedToCurrentBufferSinceLastParsing.join("\n")
      );

      if (program.errors.length > 0) {
        console.log(`Errors while parsing: ${program.errors.join("\n")}`);
        linesAddedToCurrentBufferSinceLastParsing = [];
      } else {
        for (const newLine of linesAddedToCurrentBufferSinceLastParsing) {
          currentBuffer.push(newLine);
        }
        linesAddedToCurrentBufferSinceLastParsing = [];
        state = await runProgramFromState(program, state);
      }
    } else if (isReplString(trimmedLine)) {
      switch (trimmedLine) {
        case ":quit": {
          rl.close();
          exit();
        }
        case ":help": {
          console.log("Enter some code, followed by a blank newline.");
        }
        case ":stacks": {
          console.log("Main stack:");
          for (const element of state.stack) {
            console.log(element);
          }
          console.table(state.namedStacks);
        }
      }
    } else {
      linesAddedToCurrentBufferSinceLastParsing.push(
        line.split("\t").join("    ")
      );
    }
    rl.prompt();
  }

  return state;
}

import { Expression, Program, TeganValueExpression } from "./types";

export type State = {
  kind: "State";
  stack: TeganValueExpression[];
  using: TeganValueExpression[];
  namedStacks: Record<string, TeganValueExpression[]>;
  localStack: State[];
  isStopped: boolean;
  isLooped: boolean;
};

function flattenUseAndStack(state: State): TeganValueExpression[] {
  return [...state.stack, ...state.using];
}

function print(state: State): State {
  const stack = flattenUseAndStack(state);
  for (const item of stack) {
    console.log(item.value);
  }
  return state;
}

function sum(state: State): State {
  const stack = flattenUseAndStack(state);
  let total = 0;
  let hasError: boolean = false;
  for (const item of stack.reverse()) {
    if (item.kind === "TeganStringExpression") {
      console.error("Can't sum stack, unexpected string", item.value);
      hasError = true;
    } else {
      total += item.value;
    }
  }
  if (hasError) {
    return state;
  } else {
    return {
      ...state,
      stack: [{ kind: "TeganNumberExpression", value: total }],
    };
  }
}

function stop(state: State): State {
  return { ...state, isStopped: true };
}

function loop(state: State): State {
  return { ...state, isLooped: true };
}

function eq(state: State): State {
  const stack = flattenUseAndStack(state);
  if (stack.length < 2) {
    state.stack.push({ kind: "TeganNumberExpression", value: 1 });
    return state;
  }

  const isEq = stack[stack.length - 1].value === stack[stack.length - 2].value;

  state.stack.push({ kind: "TeganNumberExpression", value: isEq ? 1 : 0 });

  return state;
}

function not(state: State): State {
  const stack = flattenUseAndStack(state);
  if (stack.length < 1) {
    return state;
  }

  const last = stack[stack.length - 1];
  if (last.kind === "TeganNumberExpression") {
    state.stack.push({
      kind: "TeganNumberExpression",
      value: last.value === 0 ? 1 : 0,
    });
  }
  return state;
}

function pop(state: State): State {
  state.stack.pop();
  return state;
}

function top(state: State): State {
  const stack = flattenUseAndStack(state);
  state.stack.push(stack[stack.length - 1]);
  return state;
}

type DebugState = {
  kind: "DebugState";
  state: State;
  currentExpressionIndex: number;
};

async function debug(
  state: State,
  program: Program,
  currentExpressionIndex: number
): Promise<State | DebugState> {
  if (typeof process !== "undefined") {
    let debugRepl = (await import("./repl")).debugRepl;
    return {
      ...(await debugRepl(state, program, currentExpressionIndex)),
      kind: "DebugState",
    };
  }
  return state;
}

type StateHandler = (
  state: State,
  program: Program,
  currentExpressionIndex: number
) => State | Promise<State> | Promise<DebugState> | Promise<State | DebugState>;

export const BUILT_INS: Record<string, StateHandler> = {
  print: print,
  sum: sum,
  debug: debug,
  stop: stop,
  loop,
  pop,
  eq,
  not,
  top,
};

export const BUILT_IN_DOCS: { [key in keyof typeof BUILT_INS]: string } = {
  print: "Print every item on the stack",
  sum: "Add every number on the stack. Throws error if string is on the stack",
  debug: "Start a debugger session",
  stop: "Exit the current into block",
  loop: "Repeat the into block",
  pop: "Remove the top item from the stack",
  eq: "Check if the top two items are the same. If equal, put 1 on the stack. Else 0",
  not: "Turn the top item 0 into 1 and 1 into 0",
  top: "Duplicate the top item on the stack",
};

async function evaluateExpression(
  expression: Expression,
  program: Program,
  currentExpressionIndex: number,
  state: State
): Promise<State> {
  switch (expression.kind) {
    case "PushToStackExpression": {
      if (expression.namedStack === null) {
        state.stack.push(expression.value);
      } else {
        if (!(expression.namedStack in state.namedStacks)) {
          state.namedStacks[expression.namedStack] = [];
        }
        state.namedStacks[expression.namedStack].push(expression.value);
      }
      return state;
    }
    case "FunctionCallExpression": {
      const localStack = expression.namedStack
        ? state.namedStacks[expression.namedStack] || []
        : state.stack;
      const localState: State = { ...state, stack: localStack };

      const func = BUILT_INS[expression.functionName];
      if (func) {
        const result = await func(localState, program, currentExpressionIndex);

        switch (result.kind) {
          case "State": {
            state = result;
            break;
          }
          case "DebugState": {
            state = result.state;
            currentExpressionIndex = result.currentExpressionIndex;
            break;
          }
        }
        return state;
      } else {
        console.error("Unknown function", expression.functionName);
        return state;
      }
    }
    case "LocalBlockExpression": {
      state.localStack.push({
        kind: "State",
        stack: [],
        using: [],
        namedStacks: state.namedStacks,
        localStack: [],
        isStopped: false,
        isLooped: false,
      });

      const lastStackIndex = state.localStack.length - 1;

      for (
        let localExpressionIndex = 0;
        localExpressionIndex < expression.values.length;
        localExpressionIndex++
      ) {
        const subExpression = expression.values[localExpressionIndex];
        state.localStack[lastStackIndex] = await evaluateExpression(
          subExpression,
          {
            kind: "Program",
            expressions: expression.values,
            errors: [],
            overallError: "",
            tokens: [],
          },
          localExpressionIndex,
          state.localStack[lastStackIndex]
        );
        if (state.localStack[lastStackIndex].isStopped) {
          break;
        }
        if (state.localStack[lastStackIndex].isLooped) {
          state.localStack[lastStackIndex].isLooped = false;
          localExpressionIndex = -1;
          continue;
        }
      }
      await evaluateExpression(
        expression.baseCall,
        program,
        currentExpressionIndex,
        state.localStack[lastStackIndex]
      );
      state.localStack.pop();
      return state;
    }
    case "TeganNumberExpression": {
      return state;
    }
    case "TeganStringExpression": {
      return state;
    }
    case "ConditionalExpression": {
      if (state.stack.length === 0) {
        return state;
      }

      if (state.stack[state.stack.length - 1].value) {
        state.stack.pop();
        return await evaluateExpression(
          expression.value,
          program,
          currentExpressionIndex,
          state
        );
      }
      return state;
    }
    case "UseExpression": {
      const originalStack = state.stack;
      let stack = state.stack;
      if (expression.namedStack === null) {
      } else {
        if (!(expression.namedStack in state.namedStacks)) {
          state.namedStacks[expression.namedStack] = [];
        }
        stack = state.namedStacks[expression.namedStack];
      }

      if (originalStack.length > 0) {
        const value: TeganValueExpression =
          originalStack.pop() as TeganValueExpression;

        const result = await evaluateExpression(
          expression.functionName,
          program,
          currentExpressionIndex,
          { ...state, stack: stack, using: [value] }
        );

        result.using = [];
        return { ...result, stack: originalStack };
      }
      return state;
    }
    case "CommentExpression": {
      return state;
    }
  }
}

export async function runProgram(program: Program): Promise<State> {
  let state: State = {
    kind: "State",
    stack: [],
    using: [],
    namedStacks: {},
    localStack: [],
    isStopped: false,
    isLooped: false,
  };
  let i = 0;
  for (const expression of program.expressions) {
    state = await evaluateExpression(expression, program, i, state);
    i++;
  }
  return state;
}

export async function runProgramFromState(
  program: Program,
  state: State
): Promise<State> {
  let i = 0;
  for (const expression of program.expressions) {
    state = await evaluateExpression(expression, program, i, state);
    i++;
  }
  return state;
}

`
# 10
? print
# 10
print

# 10


print <- % print the local stack
    # "Inside the stack"
^-------

sum
print

print <- % print the local stack
    # 1
    sum
    # 10
    eq

    ? loop
^-------
`;

const x = `

% ! counter % switch the named stack counter
% ! main % switch to the "main" stack
% # 10 => counter % push 10 to counter stack
% @ eq =< counter % use the top stack element from counter
% ? print =< counter % if counter, print current stack
% ? # 10 => counter % if true, push 10 to current stack

print <- % print the local stack
    # 1 % add 1 to the stack
    sum % sum everything on the stack

    # 10 % push 10 to the stack to check if it's summed
    @ eq % consume the 10, check if the sum is 10
    @ not % if not 10, loop
    ? loop %
^-------

print => counter

print <- % print the local stack
    # 1 % add 1 to the stack
    sum % sum everything on the stack
    top
    @ # => :counter

    # 10 % push 10 to the stack to check if it's summed
    @ eq % consume the 10, check if the sum is 10
    @ not % if not 10, loop
    ? loop
^-------
`;

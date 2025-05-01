import { exec } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { cwd } from "process";
import { parseProgram } from "../parser";
import { BUILT_INS } from "../runtime";
import { Expression, Program } from "../types";

function joinChar(
  expression: Expression,
  next: Expression | undefined
): string {
  switch (expression.kind) {
    case "PushToStackExpression":
    case "FunctionCallExpression":
    case "LocalBlockExpression":
    case "ConditionalExpression":
    case "UseExpression": {
      if (next && next.kind === "CommentExpression") {
        return " ";
      }
      return "\n";
    }
    case "CommentExpression": {
      return "\n";
    }
    case "TeganNumberExpression":
    case "TeganStringExpression": {
      break;
    }
  }
  return "";
}

type BUILT_IN_GENERATORS = { [key in keyof typeof BUILT_INS]: string };

const BUILT_IN_GENERATORS: BUILT_IN_GENERATORS = {
  print: `
func print_Tegan(stack string) {
  for _, v := range flattenStack_Tegan(stack) {
    fmt.Printf("%v\\n", v)
  }
}`,
  sum: `
func sum_Tegan(stack string) {
  total := 0
  for _, v := range flattenStack_Tegan(stack) {
    if result, ok := v.(int); ok {
      total += result
    } else {
      fmt.Printf("Error: %v is not a number\\n", v)
    }
  }
  if stack == "main" {
		mainStack = Stack{total}
	} else {
		namedStacks[stack] = Stack{total}
	}
}
  `,
  debug: "",
  stop: "",
  loop: `
func loop_Tegan(stack string) {
  isLooping = true
}
  `,
  pop: "",
  eq: `
func eq_Tegan(stack string) {
	flattenedStack := flattenStack_Tegan(stack)
	length := len(flattenedStack)
  value := 0
	if length < 2 {
    value = 1
		mainStack = append(mainStack, 1)
	} else {
		if flattenedStack[length-1] == flattenedStack[length-2] {
      value = 1
			mainStack = append(mainStack, 1)
		} else {
      value = 0
			mainStack = append(mainStack, 0)
		}
	}

  if stack == "main" {
    mainStack = append(mainStack, value)
  } else {
    namedStacks[stack] = append(namedStacks[stack], value)
  }
}
  `,
  not: `
func not_Tegan(stackName string) {
  stack := flattenStack_Tegan(stackName)

  if len(stack) < 1 {
    return
  }

  lastItem := stack[len(stack) - 1]
   if result, ok := lastItem.(int); ok {
      if result == 0 {
        mainStack = append(mainStack, 1)
      } else {
        mainStack = append(mainStack, 0)
      }
    } else {
      fmt.Printf("Error: %v is not a number\\n", v)
    }
}`,
  top: `
func top_Tegan(stack string) {
	if stack == "main" {
		mainStack = append(mainStack, mainStack[len(mainStack)-1])
	} else {
		namedStacks[stack] = append(namedStacks[stack], namedStacks[stack][len(namedStacks[stack])-1])
	}
}
  `,
};

function generateStackInitialize(stackName: string): string {
  return `
\tnamedStacks["${stackName}"] = make(Stack, 0)
`;
}

function generateBoilerplate(
  builtins: string,
  inner: string,
  stacksToInitialize: string[]
): string {
  return `
package main

import "fmt"

type Stack = []interface{}
var mainStack Stack
var namedStacks map[string]Stack
var isLooping = false
var using Stack

func flattenStack_Tegan(stack string) Stack {
	if stack == "main" {
		return append(mainStack, using)
	}
	return append(namedStacks[stack], using)
}

${builtins}

func main() {
\tnamedStacks = make(map[string]Stack)
${stacksToInitialize.map(generateStackInitialize).join("")}
\t${inner.split("\n").join("\n\t")}
}
    `;
}

export function generateExpression(expression: Expression): string {
  switch (expression.kind) {
    case "PushToStackExpression": {
      if (expression.namedStack === null) {
        return `mainStack = append(mainStack, ${generateExpression(
          expression.value
        )})`;
      }
      return `
namedStacks["${expression.namedStack}"] = append(namedStacks["${
        expression.namedStack
      }"], ${generateExpression(expression.value)})
`;
    }
    case "FunctionCallExpression": {
      const stack =
        expression.namedStack === null ? "main" : `${expression.namedStack}`;
      return `${expression.functionName}_Tegan("${stack}")`;
    }
    case "LocalBlockExpression": {
      return `
tempHolder := mainStack
mainStack = make(Stack, 0)
isLooping = false
for {
\t${expression.values.map(generateExpression).join("\n\t")}
  if !isLooping {
    break
  }
}
${generateExpression(expression.baseCall)}
mainStack = tempHolder
tempHolder = nil
      `;
    }
    case "TeganNumberExpression": {
      return `${expression.value}`;
    }
    case "TeganStringExpression": {
      return `"${expression.value}"`;
    }
    case "ConditionalExpression": {
      const stack =
        expression.namedStack === null
          ? "mainStack"
          : `namedStack["${expression.namedStack}"]`;
      return `
if ${stack}[len(${stack}) - 1] == 1 {
    ${stack} = ${stack}[:len(${stack}) - 1]
    ${generateExpression(expression.value)}
}
`;
    }
    case "UseExpression": {
      // const originalStack = state.stack;
      // let stack = state.stack;
      // if (expression.namedStack === null) {
      // } else {
      //   if (!(expression.namedStack in state.namedStacks)) {
      //     state.namedStacks[expression.namedStack] = [];
      //   }
      //   stack = state.namedStacks[expression.namedStack];
      // }

      // if (originalStack.length > 0) {
      //   const value: TeganValueExpression =
      //     originalStack.pop() as TeganValueExpression;

      //   const result = await evaluateExpression(
      //     expression.functionName,
      //     program,
      //     currentExpressionIndex,
      //     { ...state, stack: stack, using: [value] }
      //   );

      //   result.using = [];
      //   return { ...result, stack: originalStack };
      // }
      // return state;
      const stack =
        expression.namedStack === null
          ? "mainStack"
          : `namedStack["${expression.namedStack}"]`;
      return `
{
  originalStack := mainStack

  if len(originalStack) > 0 {
    value := originalStack[len(originalStack) - 1]
    originalStack = originalStack[:len(originalStack) - 1]
    using = Stack{ value }
    ${generateExpression({
      ...expression.functionName,
      namedStack: expression.namedStack,
    })}
    using = nil
  }

  originalStack = nil
}
`;
    }
    case "CommentExpression": {
      if (expression.comment.startsWith(" ")) {
        return `//${expression.comment}`;
      }
      return `// ${expression.comment}`;
    }
  }
}

function functionCallNamesExpression(expression: Expression): string[] {
  switch (expression.kind) {
    case "PushToStackExpression":
    case "TeganNumberExpression":
    case "TeganStringExpression":
    case "CommentExpression": {
      return [];
    }
    case "FunctionCallExpression": {
      return [expression.functionName];
    }
    case "LocalBlockExpression": {
      return [
        ...functionCallNamesExpression(expression.baseCall),
        ...expression.values.map(functionCallNamesExpression).flat(),
      ];
    }
    case "ConditionalExpression": {
      return functionCallNamesExpression(expression.value);
    }
    case "UseExpression": {
      return functionCallNamesExpression(expression.functionName);
    }
  }
}

function functionCallNames(program: Program): string[] {
  return program.expressions.map(functionCallNamesExpression).flat();
}

function namedStacksExpression(expression: Expression): string[] {
  switch (expression.kind) {
    case "ConditionalExpression": {
      if (expression.namedStack === null) {
        return [...namedStacksExpression(expression.value)];
      }
      return [expression.namedStack];
    }
    case "UseExpression": {
      if (expression.namedStack === null) {
        return [...namedStacksExpression(expression.functionName)];
      }
      return [
        expression.namedStack,
        ...namedStacksExpression(expression.functionName),
      ];
    }
    case "FunctionCallExpression":
    case "PushToStackExpression": {
      if (expression.namedStack === null) {
        return [];
      }
      return [expression.namedStack];
    }
    case "TeganNumberExpression":
    case "TeganStringExpression":
    case "CommentExpression": {
      return [];
    }

    case "LocalBlockExpression": {
      return [
        ...namedStacksExpression(expression.baseCall),
        ...expression.values.map(namedStacksExpression).flat(),
      ];
    }
  }
}

function namedStacks(program: Program): string[] {
  return program.expressions.map(namedStacksExpression).flat();
}

export function generateGo(program: Program): string {
  const output: string[] = [];
  let i = 0;
  for (const expression of program.expressions) {
    const next = program.expressions[i + 1];
    output.push(generateExpression(expression));
    output.push(joinChar(expression, next));
    i++;
  }

  const builtins: string[] = [];

  for (const name of functionCallNames(program)) {
    builtins.push(BUILT_IN_GENERATORS[name]);
  }
  const stacksToInitialize = [...new Set(namedStacks(program))];
  return generateBoilerplate(
    builtins.join("\n\n"),
    output.join(""),
    stacksToInitialize
  );
}

/**
 * Usage: ts-node src/generators/go.ts <filename>
 */
async function main() {
  const filename = process.argv[process.argv.length - 1].trim();
  const text = await readFile(filename, "utf-8");
  const program = parseProgram(text);
  if (program.errors.length > 0) {
    console.error("Errors! Not running.");
    for (const error of program.errors) {
      console.error(error);
    }
    console.log(program.overallError);
    return;
  }

  const split = filename.split(".");
  const baseName = join(cwd(), split.slice(0, split.length - 1).join("."));
  const outputFilename = baseName + ".go";

  const output = generateGo(program);

  await writeFile(outputFilename, output, "utf-8");

  exec(`go run ${outputFilename}`).stdout?.pipe(process.stdout);
}

main();

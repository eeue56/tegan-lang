import { readFile } from "fs/promises";
import { parseProgram } from "./parser";
import { repl } from "./repl";
import { runProgram } from "./runtime";

async function temp() {
  const program = parseProgram(`
print <- % print the local stack
    # 1 % add 1 to the stack
    sum % sum everything on the stack
    debug
    top
    @ top => :counter

    # 10 % push 10 to the stack to check if it's summed
    @ eq % consume the 10, check if the sum is 10
    @ not % if not 10, loop
    ? loop
^-------
print => :counter
`);
  console.log("Overall error:", program.overallError);
  console.log("Out:");
  await runProgram(program);
}

async function main() {
  const filenameOrRepl = process.argv[process.argv.length - 1].trim();

  if (filenameOrRepl === "--repl") {
    await repl({
      kind: "State",
      stack: [],
      using: [],
      namedStacks: {},
      localStack: [],
      isStopped: false,
      isLooped: false,
    });
  } else {
    const text = await readFile(filenameOrRepl, "utf-8");
    const program = parseProgram(text);
    if (program.errors.length > 0) {
      console.error("Errors! Not running.");
      for (const error of program.errors) {
        console.error(error);
      }
      console.log(program.overallError);
      return;
    }
    await runProgram(program);
  }
}

main();

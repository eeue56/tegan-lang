import { readFile } from "fs/promises";
import { parseProgram } from "./parser";
import { repl } from "./repl";
import { runProgram } from "./runtime";

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

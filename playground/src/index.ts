import { Diagnostic, linter } from "@codemirror/lint";
import { basicSetup, EditorView } from "codemirror";
import { generateTegan } from "../../src/generate";
import { parseProgram, parseProgramWithComments } from "../../src/parser";
import { runProgram } from "../../src/runtime";
import { TeganValueExpression } from "../../src/types";

function viewStack(name: string, stack: TeganValueExpression[]): string {
  return `
<div class="stack">
    <h2>${name}</h2>
    ${stack
      .map((item) => `<div class="stack-item">${item.value}</div>`)
      .join("")}
</div>
`;
}

function main() {
  const storedProgram: string = localStorage.getItem("program") || "";
  const root = document.getElementById("codemirror-root");
  if (!root) {
    return;
  }

  document
    .getElementById("run-program")
    ?.addEventListener("click", async () => {
      const text = view.state.doc.toString();

      const program = parseProgram(text);
      if (program.errors.length > 0) {
        console.error("Errors:", program.overallError);
        return;
      }

      console.log("Running...");

      const state = await runProgram(program);
      let stackHtml = viewStack("main", state.stack);

      for (const stackName of Object.keys(state.namedStacks)) {
        stackHtml += viewStack(stackName, state.namedStacks[stackName]);
      }
      const outputContainer = document.getElementById("output-container");
      if (outputContainer !== null) {
        outputContainer.innerHTML = stackHtml;
      }
    });

  document.getElementById("format-program")?.addEventListener("click", () => {
    const text = view.state.doc.toString();

    const program = parseProgramWithComments(text);
    if (program.errors.length > 0) {
      console.error("Errors:", program.overallError);
      return;
    }

    const output = generateTegan(program);

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: output,
      },
    });
  });

  const lintExtension = linter((view) => {
    const text = view.state.doc.toString();

    const program = parseProgram(text);
    const errors: Diagnostic[] = [];

    for (const error of program.errors) {
      errors.push({
        from: error.regionStart,
        to: error.regionEnd,
        severity: "error",
        message: error.message,
      });
    }

    return errors;
  });

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      localStorage.setItem("program", update.view.state.doc.toString());
    }
  });

  const view = new EditorView({
    parent: root,
    doc: storedProgram,
    extensions: [basicSetup, lintExtension, updateListener],
  });
}

main();

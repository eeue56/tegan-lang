import { Expression, Program } from "./types";

/**
 * In Tegan's official format, some expressions are seperated by newlines
 * Others are seperated only by spaces
 * @param expression the current expression to add newline/spaces to
 * @param next the next expression, used to detect when a space is needed
 * @returns the joining character only
 */
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

/**
 * Generate the Tegan syntax for each individual expression
 */
export function generateExpression(expression: Expression): string {
  switch (expression.kind) {
    case "PushToStackExpression": {
      const maybeNamed =
        expression.namedStack === null ? "" : ` => ${expression.namedStack}`;
      return `# ${generateExpression(expression.value)}${maybeNamed}`;
    }
    case "FunctionCallExpression": {
      const maybeNamed =
        expression.namedStack === null ? "" : ` => ${expression.namedStack}`;
      return `${expression.functionName}${maybeNamed}`;
    }
    case "LocalBlockExpression": {
      // find the longest expression within the into block
      // used to wrap the into blocks with arrows
      const lengthOfLongestExpression =
        expression.values
          .slice(0, expression.values.length)
          .filter((exp) => exp.kind !== "CommentExpression")
          .map(generateExpression)
          .sort((a, b) => a.length - b.length)
          .reverse()[0]?.length || 0;

      const base = `${generateExpression(expression.baseCall).trim()} <-`;
      const baseLength = base.length;

      const indentSize = 4;

      const extraBaseDash = "-".repeat(
        lengthOfLongestExpression + indentSize - baseLength
      );

      const extraTrailDash = "-".repeat(
        lengthOfLongestExpression + indentSize - 2
      );

      const output: string[] = [`\n${base}${extraBaseDash}`];
      if (
        expression.values[0] &&
        expression.values[0].kind === "CommentExpression"
      ) {
        output.push(" ");
      } else {
        output.push("\n");
      }
      let i = 0;
      for (const subExpression of expression.values) {
        const next = expression.values[i + 1];
        if (subExpression.kind !== "CommentExpression") {
          output.push(" ".repeat(indentSize));
        }
        output.push(generateExpression(subExpression));
        output.push(joinChar(subExpression, next));
        i++;
      }
      output.push(`^-${extraTrailDash}\n`);

      return output.join("");
    }
    case "TeganNumberExpression": {
      return `${expression.value}`;
    }
    case "TeganStringExpression": {
      return `"${expression.value}"`;
    }
    case "ConditionalExpression": {
      const maybeNamed =
        expression.namedStack === null ? "" : ` => ${expression.namedStack}`;
      return `? ${generateExpression(expression.value)}${maybeNamed}`;
    }
    case "UseExpression": {
      const functionName = generateExpression(expression.functionName).trim();
      return `@ ${functionName}`;
    }
    case "CommentExpression": {
      if (expression.comment.startsWith(" ")) {
        return `%${expression.comment}`;
      }
      return `% ${expression.comment}`;
    }
  }
}

/**
 * Turn a program into the matching Tegan syntax
 */
export function generateTegan(program: Program): string {
  const output: string[] = [];
  let i = 0;
  for (const expression of program.expressions) {
    const next = program.expressions[i + 1];
    output.push(generateExpression(expression));
    output.push(joinChar(expression, next));
    i++;
  }
  return output.join("");
}

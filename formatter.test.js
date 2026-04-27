"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { formatText } = require("./formatter");

test("replaces inline shorthand pairs with backticks", () => {
  const result = formatText("this is ;;abc;; and ;;def;; or ;; and else");
  assert.equal(result.output, "this is `abc` and `def` or ;; and else");
});

test("leaves unmatched shorthand untouched", () => {
  const result = formatText("before ;; still open");
  assert.equal(result.output, "before ;; still open");
});

test("wraps ;;+ content to end of line in backticks", () => {
  const result = formatText("this is ;;+ hehehe ;;kjsdfk;;klsdjfie");
  assert.equal(result.output, "this is ` hehehe ;;kjsdfk;;klsdjfie`");
});

test("replaces shorthand outside existing inline code only", () => {
  const result = formatText("keep `;;code;;` but change ;;text;;");
  assert.equal(result.output, "keep `;;code;;` but change `text`");
});

test("applies ;;+ before inline replacements on the same line", () => {
  const result = formatText("prefix ;;+ hello ;;name;;");
  assert.equal(result.output, "prefix ` hello ;;name;;`");
});

test("normalizes heading spacing", () => {
  const result = formatText("#Heading");
  assert.equal(result.output, "# Heading");
});

test("normalizes unordered list spacing and trailing spaces", () => {
  const result = formatText("-item");
  assert.equal(result.output, "- item  ");
});

test("normalizes ordered list spacing and trailing spaces", () => {
  const result = formatText("1.item");
  assert.equal(result.output, "1. item  ");
});

test("preserves fenced code block contents", () => {
  const input = ["```js", "#Heading", "-item", "const x = ';;abc;;';", "```"].join("\n");
  const result = formatText(input);
  assert.equal(result.output, input);
});

test("reports changed lines", () => {
  const result = formatText("#Heading\nplain");
  assert.deepEqual(result.changes, [
    {
      line: 1,
      before: "#Heading",
      after: "# Heading",
    },
  ]);
});

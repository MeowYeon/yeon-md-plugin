"use strict";

const CODE_FENCE_PATTERN = /^(\s*)(```|~~~)/;
const HEADING_PATTERN = /^(\s{0,3})(#{1,6})(\S.*)$/;
const UNORDERED_LIST_PATTERN = /^(\s*)([-*+])(\S.*)$/;
const ORDERED_LIST_PATTERN = /^(\s*)(\d+\.)(\S.*)$/;
const LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;

function formatText(input) {
  const lines = input.split("\n");
  const outputLines = [];
  let inCodeFence = false;
  let activeFence = null;

  for (const line of lines) {
    const fenceMatch = line.match(CODE_FENCE_PATTERN);

    if (fenceMatch) {
      const fenceToken = fenceMatch[2];

      if (!inCodeFence) {
        inCodeFence = true;
        activeFence = fenceToken;
      } else if (fenceToken === activeFence) {
        inCodeFence = false;
        activeFence = null;
      }

      outputLines.push(line);
      continue;
    }

    if (inCodeFence) {
      outputLines.push(line);
      continue;
    }

    outputLines.push(formatMarkdownLine(line));
  }

  const output = outputLines.join("\n");

  return {
    output,
    changes: summarizeChanges(input, output),
  };
}

function formatMarkdownLine(line) {
  let nextLine = applyLineShorthand(line);
  nextLine = replaceInlineBacktickShorthand(nextLine);
  nextLine = normalizeHeadingSpacing(nextLine);
  nextLine = normalizeListMarkerSpacing(nextLine);
  nextLine = normalizeListTrailingSpaces(nextLine);

  return nextLine;
}

function applyLineShorthand(line) {
  const markerIndex = line.indexOf(";;+");
  if (markerIndex === -1) {
    return line;
  }

  const prefix = line.slice(0, markerIndex);
  const content = line.slice(markerIndex + 3);
  return `${prefix}\`${content}\``;
}

function normalizeHeadingSpacing(line) {
  return line.replace(HEADING_PATTERN, (_, indent, hashes, text) => {
    return `${indent}${hashes} ${text.trimStart()}`;
  });
}

function normalizeListMarkerSpacing(line) {
  let nextLine = line.replace(UNORDERED_LIST_PATTERN, (_, indent, marker, text) => {
    return `${indent}${marker} ${text.trimStart()}`;
  });

  nextLine = nextLine.replace(ORDERED_LIST_PATTERN, (_, indent, marker, text) => {
    return `${indent}${marker} ${text.trimStart()}`;
  });

  return nextLine;
}

function normalizeListTrailingSpaces(line) {
  if (!LIST_ITEM_PATTERN.test(line)) {
    return line;
  }

  return line.replace(/[ \t]*$/, "  ");
}

function summarizeChanges(before, after) {
  if (before === after) {
    return [];
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  const changes = [];

  for (let index = 0; index < maxLength; index += 1) {
    const beforeLine = beforeLines[index] ?? "";
    const afterLine = afterLines[index] ?? "";

    if (beforeLine === afterLine) {
      continue;
    }

    changes.push({
      line: index + 1,
      before: beforeLine,
      after: afterLine,
    });
  }

  return changes;
}

function replaceInlineBacktickShorthand(line) {
  let result = "";
  let index = 0;
  let inCodeSpan = false;

  while (index < line.length) {
    if (line[index] === "`") {
      inCodeSpan = !inCodeSpan;
      result += line[index];
      index += 1;
      continue;
    }

    if (!inCodeSpan && line.startsWith(";;", index)) {
      const closingIndex = line.indexOf(";;", index + 2);
      if (closingIndex !== -1) {
        const content = line.slice(index + 2, closingIndex);
        result += `\`${content}\``;
        index = closingIndex + 2;
        continue;
      }
    }

    result += line[index];
    index += 1;
  }

  return result;
}

module.exports = {
  formatText,
  formatMarkdownLine,
  summarizeChanges,
};

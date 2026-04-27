"use strict";

const { Modal, Notice, Plugin, Setting, MarkdownView } = require("obsidian");

const MENU_TITLE = "Custom Format";
const PREVIEW_LIMIT = 8;
const CODE_FENCE_PATTERN = /^(\s*)(```|~~~)/;
const HEADING_PATTERN = /^(\s{0,3})(#{1,6})(\S.*)$/;
const UNORDERED_LIST_PATTERN = /^(\s*)([-*+])(\S.*)$/;
const ORDERED_LIST_PATTERN = /^(\s*)(\d+\.)(\S.*)$/;
const LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;

class FormatPreviewModal extends Modal {
  constructor(app, file, before, formatResult) {
    super(app);
    this.file = file;
    this.before = before;
    this.formatResult = formatResult;
    this.decision = false;
    this._resolver = null;
    this.result = new Promise((resolve) => {
      this._resolver = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("format-preview-modal");

    contentEl.createEl("h2", {
      text: `Apply formatting to ${this.file.basename}?`,
    });

    contentEl.createEl("p", {
      text: `${this.formatResult.changes.length} line(s) would change before closing.`,
    });

    const previewContainer = contentEl.createDiv({ cls: "format-preview-list" });

    for (const change of this.formatResult.changes.slice(0, PREVIEW_LIMIT)) {
      const block = previewContainer.createDiv({ cls: "format-preview-item" });
      block.createEl("div", {
        text: `Line ${change.line}`,
        cls: "format-preview-line-number",
      });
      block.createEl("pre", {
        text: `- ${visualizeWhitespace(change.before)}`,
        cls: "format-preview-before",
      });
      block.createEl("pre", {
        text: `+ ${visualizeWhitespace(change.after)}`,
        cls: "format-preview-after",
      });
    }

    if (this.formatResult.changes.length > PREVIEW_LIMIT) {
      previewContainer.createEl("p", {
        text: `...and ${this.formatResult.changes.length - PREVIEW_LIMIT} more changed line(s).`,
      });
    }

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Apply").setCta().onClick(() => {
          this.decision = true;
          this.close();
        })
      )
      .addButton((button) =>
        button.setButtonText("Skip").onClick(() => {
          this.decision = false;
          this.close();
        })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this._resolver) {
      this._resolver(this.decision);
      this._resolver = null;
    }
  }

  waitForDecision() {
    this.open();
    return this.result;
  }
}

module.exports = class FormatPlugin extends Plugin {
  async onload() {
    this.fileState = new Map();
    this.pendingCloseFormats = new Set();
    this.openMarkdownFilePaths = this.getOpenMarkdownFilePaths();

    this.addCommand({
      id: "custom-format",
      name: MENU_TITLE,
      editorCallback: (editor, view) => {
        this.formatSelectionOrDocument(editor, view);
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item.setTitle(MENU_TITLE).setIcon("wand").onClick(() => {
            this.formatSelectionOrDocument(editor, view);
          });
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        const view = this.findMarkdownViewForEditor(editor) ?? this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file;
        if (!file) {
          return;
        }

        this.captureFileState(file, editor.getValue());
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", async () => {
        await this.handleLayoutChange();
      })
    );

    this.registerEvent(
      this.app.workspace.on("quit", async () => {
        await this.handleAppQuit();
      })
    );

    this.registerDomEvent(window, "beforeunload", () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const file = activeView?.file;
      if (!file) {
        return;
      }

      this.captureFileState(file, activeView.editor.getValue());
    });

    this.captureCurrentViewState();
  }

  onunload() {
    this.fileState.clear();
    this.pendingCloseFormats.clear();
  }

  captureCurrentViewState() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file;
    if (!file) {
      return;
    }

    this.captureFileState(file, activeView.editor.getValue());
  }

  captureFileState(file, text) {
    this.fileState.set(file.path, {
      file,
      text,
    });
  }

  getOpenMarkdownFilePaths() {
    const openPaths = new Set();

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const file = leaf.view?.file;
      if (file?.path) {
        openPaths.add(file.path);
      }
    }

    return openPaths;
  }

  findMarkdownViewForEditor(editor) {
    const leaves = this.app.workspace.getLeavesOfType("markdown");

    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }

      if (view.editor === editor) {
        return view;
      }
    }

    return null;
  }

  async handleLayoutChange() {
    const currentOpenPaths = this.getOpenMarkdownFilePaths();
    const closedPaths = [...this.openMarkdownFilePaths].filter((path) => !currentOpenPaths.has(path));

    for (const path of closedPaths) {
      const state = this.fileState.get(path);
      if (!state) {
        continue;
      }

      await this.maybeFormatOnClose(state.file, state.text);
      this.fileState.delete(path);
    }

    this.openMarkdownFilePaths = currentOpenPaths;
  }

  async handleAppQuit() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = activeView?.file;
    if (!activeFile) {
      return;
    }

    this.captureFileState(activeFile, activeView.editor.getValue());
    const state = this.fileState.get(activeFile.path);
    if (!state) {
      return;
    }

    await this.maybeFormatOnClose(state.file, state.text);
  }

  formatSelectionOrDocument(editor, view) {
    const file = view?.file ?? this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active Markdown file to format.");
      return;
    }

    if (editor.somethingSelected()) {
      const selectedText = editor.getSelection();
      const result = formatText(selectedText);
      if (result.output !== selectedText) {
        editor.replaceSelection(result.output);
        new Notice("Custom format applied to selection.");
      }
    } else {
      const currentText = editor.getValue();
      const result = formatText(currentText);
      if (result.output !== currentText) {
        editor.setValue(result.output);
        new Notice("Custom format applied.");
      }
    }

    this.captureFileState(file, editor.getValue());
  }

  async maybeFormatOnClose(file, originalText) {
    if (!file || this.pendingCloseFormats.has(file.path)) {
      return;
    }

    const result = formatText(originalText);
    if (result.output === originalText) {
      return;
    }

    this.pendingCloseFormats.add(file.path);

    try {
      const modal = new FormatPreviewModal(this.app, file, originalText, result);
      const shouldApply = await modal.waitForDecision();

      if (!shouldApply) {
        return;
      }

      const latestContent = await this.app.vault.cachedRead(file);
      const latestResult = formatText(latestContent);

      if (latestResult.output === latestContent) {
        return;
      }

      await this.app.vault.modify(file, latestResult.output);
      new Notice(`Formatted ${file.basename} before closing.`);
    } finally {
      this.pendingCloseFormats.delete(file.path);
    }
  }
};

function visualizeWhitespace(value) {
  return value.replace(/ /g, "·");
}

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

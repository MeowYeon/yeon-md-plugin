# Format

Personal Obsidian plugin for custom Markdown formatting.

## Features

- Right-click menu action: `Custom Format`
- Selection-first formatting, falling back to the whole document
- Close-time formatting preview for changed files
- Built-in formatting rules for shorthand backticks, heading spacing, and list normalization

## Rules

- `;;text;;` becomes `` `text` ``
- `;;+` wraps the rest of the line in backticks
- Heading markers get a separating space: `#Title` -> `# Title`
- Ordered and unordered list markers get a separating space
- List items end with two trailing spaces
- Fenced code blocks are left untouched

## Development

Run tests with:

```bash
npm test
```

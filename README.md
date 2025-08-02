# Blobify Format for VS Code

This extension provides language support and formatting for `.blobify` configuration files used by the [Blobify](https://github.com/AlexanderParker/blobify) tool.

## Features

- **Syntax Highlighting**: Full syntax highlighting for .blobify files including:

  - Context sections `[context-name]`
  - Include patterns `+pattern`
  - Exclude patterns `-pattern`
  - Switches `@switch` and `@key=value`
  - Comments `# comment`

- **Formatting**: Automatic code formatting with:

  - Consistent indentation
  - Comment alignment (configurable)
  - Pattern organisation

- **Validation**: Real-time validation with:

  - Syntax error detection
  - Unknown switch warnings
  - Duplicate context detection
  - Empty pattern/context warnings

- **IntelliSense**: Basic autocompletion for:
  - Valid switch names
  - Common patterns
  - Context brackets

## Usage

### Basic Syntax

```blobify
# Default context patterns
+*.py
+*.md
-*.log
@debug
@output=results.txt

[docs-only]
# Documentation files only
-**
+*.md
+docs/**

[signatures]
# Extract function signatures
@filter=signatures:^(def|class)\\s+
@no-line-numbers
+*.py
```

### Commands

- `Blobify: Format File` (Shift+Alt+F) - Format the current .blobify file
- `Blobify: Validate File` - Validate syntax and show diagnostics

### Configuration

Access these settings via File → Preferences → Settings, then search for "blobify":

- `blobify.formatter.indentSize` - Number of spaces for indentation (default: 2)
- `blobify.formatter.alignComments` - Align comments in context sections (default: true)
- `blobify.validation.enabled` - Enable validation of .blobify files (default: true)

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (Mac)
3. Search for "Blobify Format"
4. Click Install

### Manual Installation

1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Press `Ctrl+Shift+P` and type "Extensions: Install from VSIX"
4. Select the downloaded `.vsix` file

## About Blobify

Blobify is a tool that packages your entire codebase into a single text file for AI consumption. It respects `.gitignore` files and supports custom filtering via `.blobify` configuration files.

Learn more at: https://github.com/AlexanderParker/blobify

## Contributing

Issues and pull requests are welcome! Please visit our [GitHub repository](https://github.com/your-username/blobify-format).

## License

This extension is licensed under the MIT License.

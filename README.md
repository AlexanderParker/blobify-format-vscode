<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="icons/blobify-light.svg">
      <source media="(prefers-color-scheme: light)" srcset="icons/blobify-dark.svg">
      <img alt="Blobify" src="icons/blobify-dark.svg" width="48" height="48" style="vertical-align: middle; margin-right: 12px;">
    </picture>
    Blobify Format for VS Code
  </h1>
</div>

VSCode language support and formatting for `.blobify` configuration files used by the [Blobify](https://github.com/AlexanderParker/blobify) tool.

## Features

- **Syntax Highlighting**: Full syntax highlighting for .blobify files including:

  - Context sections `[context-name]` and inheritance `[context:parent]`
  - Include patterns `+pattern`
  - Exclude patterns `-pattern`
  - Configuration options `@option=value`
  - Comments `# comment`

- **Context Inheritance Support**: Full support for the new inheritance features:

  - Single inheritance: `[context:parent]`
  - Multiple inheritance: `[context:parent1,parent2]`
  - Validation of parent context references
  - Hover information showing inheritance relationships

- **Formatting**: Automatic code formatting with:

  - Consistent indentation
  - Comment alignment (configurable)
  - Pattern organisation

- **Validation**: Real-time validation with:

  - Syntax error detection
  - Unknown option warnings
  - Duplicate context detection
  - Empty pattern/context warnings
  - Parent context validation for inheritance
  - Boolean value validation for appropriate options

- **IntelliSense**: Advanced autocompletion for:
  - Valid option names with correct syntax
  - Common patterns and filters
  - Context brackets with inheritance templates
  - Pre-built context snippets

## Usage

### Basic Syntax

```blobify
# Default context patterns
+*.py
+*.md
-*.log
@copy-to-clipboard=true
@output-filename=results.txt

[docs-only]
# Documentation files only
-**
+*.md
+docs/**

[signatures]
# Extract function signatures
@filter=signatures:^(def|class)\\s+
@output-line-numbers=false
+*.py
```

### Context Inheritance

```blobify
# Base configuration
@copy-to-clipboard=true
@debug=true
+*.py
-*.pyc

[backend:default]
# Inherits from default context
+*.sql
+migrations/**
@filter=functions:^def

[frontend:default]
# Also inherits from default
+*.js
+*.vue
+*.css

[full:backend,frontend]
# Multiple inheritance - combines backend + frontend
+*.md
+docs/**
@show-excluded=false
```

### Commands

- `Blobify: Format File` (Shift+Alt+F) - Format the current .blobify file
- `Blobify: Validate File` - Validate syntax and show diagnostics

### Configuration

Access these settings via File → Preferences → Settings, then search for "blobify":

- `blobify.formatter.indentSize` - Number of spaces for indentation (default: 2)
- `blobify.formatter.alignComments` - Align comments in context sections (default: true)
- `blobify.validation.enabled` - Enable validation of .blobify files (default: true)

## Available Options

The extension supports all current blobify configuration options:

### Boolean Options

- `@copy-to-clipboard=true|false` - Copy output to clipboard
- `@debug=true|false` - Enable debug output
- `@enable-scrubbing=true|false` - Enable sensitive data scrubbing
- `@output-line-numbers=true|false` - Include line numbers
- `@output-index=true|false` - Include file index
- `@output-content=true|false` - Include file contents
- `@output-metadata=true|false` - Include file metadata
- `@show-excluded=true|false` - Show excluded files

### Value Options

- `@output-filename=filename.txt` - Specify output file
- `@list-patterns=none|ignored|contexts` - List patterns and exit
- `@filter=name:regex` - Content filtering with regular expressions

## Snippets

The extension includes helpful snippets:

- `ctx` - Basic context section
- `ctxi` - Context with single inheritance
- `ctxm` - Context with multiple inheritance
- `docs` - Documentation-only context
- `sigs` - Python signatures filter
- `backend` - Backend context with inheritance
- `frontend` - Frontend context with inheritance
- `clip` - Copy to clipboard option
- `filter` - Content filter template
- And many more...

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

Blobify is a tool that packages your entire codebase into a single text file for AI consumption. It respects `.gitignore` files and supports custom filtering via `.blobify` configuration files with powerful context inheritance.

Key features:

- Context inheritance for reusable configurations
- Content filtering with regular expressions
- Sensitive data scrubbing (optional)
- Cross-platform clipboard support
- Flexible output formatting

Learn more at: https://github.com/AlexanderParker/blobify

## Contributing

Issues and pull requests are welcome! Please visit our [GitHub repository](https://github.com/AlexanderParker/blobify/blobify-format).

## License

[MIT License](LICENSE) - see the project repository for details.

import * as vscode from "vscode";
import { parse } from "csv-parse/sync";
import { BlobifyContextCompletionProvider } from "./contextCompletion";

export function activate(context: vscode.ExtensionContext) {
  console.log("Blobify language support is now active!");

  // Register formatter
  const formatter = new BlobifyFormatter();
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider("blobify", formatter));

  // Register hover provider
  const hoverProvider = new BlobifyHoverProvider();
  context.subscriptions.push(vscode.languages.registerHoverProvider("blobify", hoverProvider));

  // Register completion provider
  const completionProvider = new BlobifyCompletionProvider();
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider("blobify", completionProvider, "@", "+", "-", "[", "#"));

  // Register context inheritance completion provider
  const contextCompletionProvider = new BlobifyContextCompletionProvider();
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider("blobify", contextCompletionProvider, ":", ","));
  // Register commands
  const formatCommand = vscode.commands.registerCommand("blobify.format", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "blobify") {
      vscode.commands.executeCommand("editor.action.formatDocument");
    }
  });

  const validateCommand = vscode.commands.registerCommand("blobify.validate", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "blobify") {
      validateBlobifyFile(editor.document);
    }
  });

  context.subscriptions.push(formatCommand, validateCommand);

  // Register diagnostics provider
  const diagnostics = vscode.languages.createDiagnosticCollection("blobify");
  context.subscriptions.push(diagnostics);

  // Validate on save and change
  const validateOnChange = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === "blobify") {
      validateBlobifyFile(e.document, diagnostics);
    }
  });

  const validateOnSave = vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.languageId === "blobify") {
      validateBlobifyFile(document, diagnostics);
    }
  });

  context.subscriptions.push(validateOnChange, validateOnSave);
}

class BlobifyFormatter implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const text = document.getText();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      let formattedLine = trimmedLine;

      if (line !== formattedLine) {
        const range = new vscode.Range(i, 0, i, line.length);
        edits.push(vscode.TextEdit.replace(range, formattedLine));
      }
    }

    return edits;
  }
}

class BlobifyHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position);
    const text = line.text.trim();

    // Hover for LLM instructions (double-hash comments)
    if (text.startsWith("##")) {
      const instruction = text.slice(2).trim();
      const info = `**LLM/AI Instruction**\n\nThis instruction will appear in the output header:\n\n\`# * ${instruction}\`\n\n*LLM instructions help provide context to AI assistants about how to analyse the code.*`;
      return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
    }

    // Hover for filter options with CSV format
    if (text.startsWith("@filter=")) {
      const filterContent = text.substring(8); // Remove "@filter="

      const csvValues = parseFilterCSV(filterContent);

      if (csvValues && csvValues.length >= 2 && csvValues.length <= 3) {
        // CSV format
        const filterName = csvValues[0];
        const regexPattern = csvValues[1];
        const filePattern = csvValues[2] || "*";

        let info = `**Content Filter (CSV Format)**\n\nFilter: \`${filterName}\`\n\nRegex: \`${regexPattern}\`\n\nFile Pattern: \`${filePattern}\`\n\n`;

        // For hover display, show the unescaped regex for clarity
        const unescapedRegex = regexPattern.replace(/\\\\/g, "\\");
        const regexInfo = this.explainRegex(unescapedRegex);
        if (regexInfo) {
          info += regexInfo + "\n\n";
        }

        info += "*Filters extract only lines matching the regex pattern from files matching the file pattern.*";

        return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
      } else {
        // Legacy format: @filter=name:regex
        const legacyMatch = filterContent.match(/^([^:]+):(.+)$/);
        if (legacyMatch) {
          const filterName = legacyMatch[1];
          const regexPattern = legacyMatch[2];

          let info = `**Content Filter (Legacy Format)**\n\nFilter: \`${filterName}\`\n\nRegex: \`${regexPattern}\`\n\nFile Pattern: \`*\` (all files)\n\n`;
          info += '*Consider updating to CSV format: @filter="name","regex","filepattern"*\n\n';

          const regexInfo = this.explainRegex(regexPattern);
          if (regexInfo) {
            info += regexInfo;
          }

          return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
        }
      }
    }

    // Hover for other options
    if (text.startsWith("@")) {
      const optionMatch = text.match(/^@([a-zA-Z-_]+)(?:=(.+))?/);
      if (optionMatch) {
        const optionName = optionMatch[1];
        const optionInfo = this.getOptionInfo(optionName);
        if (optionInfo) {
          return new vscode.Hover(new vscode.MarkdownString(optionInfo), new vscode.Range(position.line, 0, position.line, line.text.length));
        }
      }
    }

    // Hover for patterns
    if (text.startsWith("+") || text.startsWith("-")) {
      const isInclude = text.startsWith("+");
      const pattern = text.slice(1).trim();

      let info = `**${isInclude ? "Include" : "Exclude"} Pattern**\n\n`;
      info += `Pattern: \`${pattern}\`\n\n`;

      if (pattern.includes("**")) {
        info += "• `**` matches any number of directories\n";
      }
      if (pattern.includes("*")) {
        info += "• `*` matches any characters except `/`\n";
      }
      if (pattern.includes("?")) {
        info += "• `?` matches any single character\n";
      }

      info += `\n*${isInclude ? "Files matching this pattern will be included" : "Files matching this pattern will be excluded"}*`;

      return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
    }

    // Hover for contexts (including inheritance)
    if (text.startsWith("[") && text.endsWith("]")) {
      const contextContent = text.slice(1, -1);
      const inheritanceMatch = contextContent.match(/^([^:]+):(.+)$/);

      if (inheritanceMatch) {
        const contextName = inheritanceMatch[1];
        const parents = inheritanceMatch[2].split(",").map((p) => p.trim());

        let info = `**Context Section with Inheritance**\n\nContext: \`${contextName}\`\n\n`;
        info += `Inherits from: ${parents.map((p) => `\`${p}\``).join(", ")}\n\n`;
        info += `Use with: \`bfy -x ${contextName}\` or \`bfy --context=${contextName}\`\n\n`;
        info += "*This context inherits all patterns and options from its parent contexts, then adds its own.*";

        return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
      } else {
        const contextName = contextContent;
        const info =
          `**Context Section**\n\nContext: \`${contextName}\`\n\n` +
          "Use with: `bfy -x " +
          contextName +
          "` or `bfy --context=" +
          contextName +
          "`\n\n" +
          "*Patterns in this section only apply when this context is selected.*";

        return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
      }
    }

    return null;
  }

  private getOptionInfo(optionName: string): string | null {
    const options: { [key: string]: string } = {
      "copy-to-clipboard": "**Copy to Clipboard**\n\nCopy output to clipboard\n\n`@copy-to-clipboard=true`",
      debug: "**Debug Mode**\n\nEnable debug output for gitignore and .blobify processing\n\n`@debug=true`",
      "enable-scrubbing": "**Enable Scrubbing**\n\nEnable scrubadub processing of sensitive data\n\n`@enable-scrubbing=true` (default: true)",
      "output-line-numbers": "**Output Line Numbers**\n\nInclude line numbers in file content output\n\n`@output-line-numbers=true` (default: true)",
      "output-index": "**Output Index**\n\nInclude file index section at start of output\n\n`@output-index=true` (default: true)",
      "output-content": "**Output Content**\n\nInclude file contents in output\n\n`@output-content=true` (default: true)",
      "output-metadata": "**Output Metadata**\n\nInclude file metadata (size, timestamps, status) in output\n\n`@output-metadata=true` (default: true)",
      "show-excluded": "**Show Excluded**\n\nShow excluded files in file contents section\n\n`@show-excluded=true` (default: true)",
      "suppress-timestamps":
        "**Suppress Timestamps**\n\nSuppress timestamps in output for reproducible builds\n\n`@suppress-timestamps=false` (default: false)",
      "list-patterns": "**List Patterns**\n\nList patterns and exit\n\n`@list-patterns=ignored` or `@list-patterns=contexts`",
      "output-filename": "**Output File**\n\nSpecify output file path\n\n`@output-filename=results.txt`",
      filter:
        '**Content Filter**\n\nExtract only lines matching regex pattern\n\n**CSV Format (recommended):** `@filter="name","regex","filepattern"`\n\n**Legacy Format:** `@filter=name:regex`\n\nExample: `@filter="functions","^def\\\\s+","*.py"`',
    };

    return options[optionName] || null;
  }

  private explainRegex(pattern: string): string {
    const explanations: string[] = [];

    // Basic anchors
    if (pattern.includes("^")) {
      explanations.push("• `^` matches start of line");
    }
    if (pattern.includes("$")) {
      explanations.push("• `$` matches end of line");
    }

    // Character classes
    if (pattern.includes("\\s+")) {
      explanations.push("• `\\s+` matches one or more whitespace characters");
    }
    if (pattern.includes("\\s*")) {
      explanations.push("• `\\s*` matches zero or more whitespace characters");
    }
    if (pattern.includes("\\w+")) {
      explanations.push("• `\\w+` matches one or more word characters");
    }
    if (pattern.includes("\\w*")) {
      explanations.push("• `\\w*` matches zero or more word characters");
    }
    if (pattern.includes("\\d+")) {
      explanations.push("• `\\d+` matches one or more digits");
    }
    if (pattern.includes("\\d*")) {
      explanations.push("• `\\d*` matches zero or more digits");
    }

    // Quantifiers
    if (pattern.includes(".*")) {
      explanations.push("• `.*` matches any characters (greedy)");
    }
    if (pattern.includes(".+")) {
      explanations.push("• `.+` matches one or more of any character");
    }
    if (pattern.includes("*") && !pattern.includes(".*") && !pattern.includes("\\s*") && !pattern.includes("\\w*") && !pattern.includes("\\d*")) {
      explanations.push("• `*` matches zero or more of the preceding element");
    }
    if (pattern.includes("+") && !pattern.includes(".+") && !pattern.includes("\\s+") && !pattern.includes("\\w+") && !pattern.includes("\\d+")) {
      explanations.push("• `+` matches one or more of the preceding element");
    }
    if (pattern.includes("?")) {
      explanations.push("• `?` matches zero or one of the preceding element");
    }

    // Character classes
    const characterClassMatches = pattern.match(/\[([^\]]+)\]/g);
    if (characterClassMatches) {
      characterClassMatches.forEach((match) => {
        const content = match.slice(1, -1); // Remove [ and ]
        if (content.includes("a-z")) {
          explanations.push("• `[a-z]` matches lowercase letters");
        } else if (content.includes("A-Z")) {
          explanations.push("• `[A-Z]` matches uppercase letters");
        } else if (content.includes("0-9")) {
          explanations.push("• `[0-9]` matches digits");
        } else if (content.includes("a-zA-Z")) {
          explanations.push("• `[a-zA-Z]` matches letters");
        } else if (content.includes("a-zA-Z0-9")) {
          explanations.push("• `[a-zA-Z0-9]` matches letters and digits");
        } else {
          explanations.push(`• \`${match}\` matches any character in the set`);
        }
      });
    }

    // Operators
    if (pattern.includes("|")) {
      explanations.push("• `|` means OR (matches either pattern)");
    }

    // Grouping
    if (pattern.includes("(") && pattern.includes(")")) {
      explanations.push("• `()` groups patterns together");
    }

    // Escape sequences
    if (pattern.includes("\\.")) {
      explanations.push("• `\\.` matches a literal dot");
    }
    if (pattern.includes("\\\\")) {
      explanations.push("• `\\\\` matches a literal backslash");
    }

    // Common programming patterns
    if (pattern.includes("def\\s+")) {
      explanations.push("• Matches Python function definitions");
    }
    if (pattern.includes("class\\s+")) {
      explanations.push("• Matches Python class definitions");
    }
    if (pattern.includes("import\\s+") || pattern.includes("from\\s+.*import")) {
      explanations.push("• Matches Python import statements");
    }
    if (pattern.includes("return\\s+") || pattern.includes("yield\\s+")) {
      explanations.push("• Matches return/yield statements");
    }

    // YAML/config patterns
    if (pattern.includes(":\\s*$") || pattern.includes("\\s*:")) {
      explanations.push("• Matches key-value pairs (like YAML keys)");
    }

    // Common comment patterns
    if (pattern.includes("TODO|FIXME|XXX|HACK|NOTE|WARNING")) {
      explanations.push("• Matches common TODO/comment keywords");
    }

    return explanations.length > 0 ? "**Regex Explanation:**\n" + explanations.join("\n") : "";
  }
}

class BlobifyCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position);
    const text = line.text.substring(0, position.character);

    if (text.trim() === "##" || text.endsWith("##")) {
      return this.getLLMInstructionCompletions();
    }

    if (text.trim() === "@" || text.endsWith("@")) {
      return this.getOptionCompletions();
    }

    if (text.trim() === "+" || text.endsWith("+")) {
      return this.getPatternCompletions();
    }

    if (text.trim() === "-" || text.endsWith("-")) {
      return this.getPatternCompletions();
    }

    if (text.trim() === "[" || text.endsWith("[")) {
      return this.getContextCompletions();
    }

    return [];
  }

  private getLLMInstructionCompletions(): vscode.CompletionItem[] {
    const instructions = [
      { text: "This code represents a Python web application", detail: "Python web app context" },
      { text: "Focus on security vulnerabilities and performance issues", detail: "Security and performance focus" },
      { text: "Provide recommendations for improvements", detail: "Request for recommendations" },
      { text: "Review this documentation for clarity and completeness", detail: "Documentation review" },
      { text: "Check for broken links and outdated information", detail: "Documentation validation" },
      { text: "Pay special attention to authentication and authorization mechanisms", detail: "Auth security focus" },
      { text: "Analyse for SQL injection and XSS vulnerabilities", detail: "Web security focus" },
      { text: "Review code for best practices and maintainability", detail: "Code quality focus" },
    ];

    return instructions.map((instruction) => {
      const item = new vscode.CompletionItem(instruction.text, vscode.CompletionItemKind.Text);
      item.detail = instruction.detail;
      item.insertText = " " + instruction.text;
      return item;
    });
  }

  private getOptionCompletions(): vscode.CompletionItem[] {
    const items = [
      { name: "copy-to-clipboard", detail: "Copy output to clipboard", insertText: "copy-to-clipboard=true", priority: 100 },
      { name: "debug", detail: "Enable debug output", insertText: "debug=true", priority: 95 },
      { name: "enable-scrubbing", detail: "Enable scrubadub processing", insertText: "enable-scrubbing=true", priority: 90 },
      { name: "output-line-numbers", detail: "Include line numbers", insertText: "output-line-numbers=false", priority: 85 },
      { name: "output-index", detail: "Include file index section", insertText: "output-index=false", priority: 80 },
      { name: "output-content", detail: "Include file contents", insertText: "output-content=false", priority: 75 },
      { name: "output-metadata", detail: "Include file metadata", insertText: "output-metadata=false", priority: 70 },
      { name: "show-excluded", detail: "Show excluded files", insertText: "show-excluded=false", priority: 65 },
      { name: "suppress-timestamps", detail: "Suppress timestamps for reproducible builds", insertText: "suppress-timestamps=true", priority: 63 },
      { name: "list-patterns", detail: "List patterns and exit", insertText: "list-patterns=${1|none,ignored,contexts|}", priority: 60 },
      { name: "output-filename", detail: "Output file path", insertText: "output-filename=${1:filename.txt}", priority: 55 },
      {
        name: "filter (CSV - signatures)",
        detail: "Python signatures (CSV format)",
        insertText: 'filter="signatures","^\\\\s*(class\\\\s+\\\\w+.*:|def\\\\s+\\\\w+.*:|async\\\\s+def\\\\s+\\\\w+.*:)","*.py"',
        priority: 50,
      },
      {
        name: "filter (CSV - functions)",
        detail: "Python functions (CSV format)",
        insertText: 'filter="functions","^\\\\s*(def\\\\s+\\\\w+.*:|async\\\\s+def\\\\s+\\\\w+.*:)","*.py"',
        priority: 45,
      },
      {
        name: "filter (CSV - classes)",
        detail: "Python classes (CSV format)",
        insertText: 'filter="classes","^\\\\s*class\\\\s+\\\\w+.*:","*.py"',
        priority: 40,
      },
      {
        name: "filter (CSV - imports)",
        detail: "Python imports (CSV format)",
        insertText: 'filter="imports","^\\\\s*(from\\\\s+\\\\w+.*import.*|import\\\\s+\\\\w+.*)","*.py"',
        priority: 35,
      },
      {
        name: "filter (CSV - returns)",
        detail: "Return statements (CSV format)",
        insertText: 'filter="returns","^\\\\s*(return\\\\s+.*|yield\\\\s+.*)","*.py"',
        priority: 30,
      },
      {
        name: "filter (CSV - decorators)",
        detail: "Python decorators (CSV format)",
        insertText: 'filter="decorators","^\\\\s*@\\\\w+.*","*.py"',
        priority: 25,
      },
      {
        name: "filter (CSV - todos)",
        detail: "TODO comments (CSV format)",
        insertText: 'filter="todos","(TODO|FIXME|XXX|HACK|NOTE|WARNING)"',
        priority: 20,
      },
      {
        name: "filter (CSV - custom)",
        detail: "Custom filter (CSV format)",
        insertText: 'filter="${1:name}","${2:regex}","${3:*.py}"',
        priority: 15,
      },
      {
        name: "filter (legacy)",
        detail: "Custom filter (legacy format)",
        insertText: "filter=${1:name}:${2:regex}",
        priority: 10,
      },
    ];

    return items.map((item) => {
      const completion = new vscode.CompletionItem(
        item.name,
        item.name.includes("filter") ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Property
      );
      completion.detail = item.detail;
      completion.insertText = new vscode.SnippetString(item.insertText || item.name);
      completion.sortText = String(1000 - item.priority).padStart(4, "0");
      return completion;
    });
  }

  private getPatternCompletions(): vscode.CompletionItem[] {
    const patterns = [
      { pattern: "*.py", detail: "Python files" },
      { pattern: "*.js", detail: "JavaScript files" },
      { pattern: "*.ts", detail: "TypeScript files" },
      { pattern: "*.jsx", detail: "React JSX files" },
      { pattern: "*.tsx", detail: "React TypeScript files" },
      { pattern: "*.vue", detail: "Vue.js files" },
      { pattern: "*.css", detail: "CSS files" },
      { pattern: "*.scss", detail: "SCSS files" },
      { pattern: "*.md", detail: "Markdown files" },
      { pattern: "*.json", detail: "JSON files" },
      { pattern: "*.yaml", detail: "YAML files" },
      { pattern: "*.yml", detail: "YAML files" },
      { pattern: "*.sql", detail: "SQL files" },
      { pattern: "*.txt", detail: "Text files" },
      { pattern: "*.html", detail: "HTML files" },
      { pattern: "**", detail: "All files and directories" },
      { pattern: "docs/**", detail: "All files in docs directory" },
      { pattern: "src/**", detail: "All files in src directory" },
      { pattern: "tests/**", detail: "All files in tests directory" },
      { pattern: "migrations/**", detail: "All files in migrations directory" },
      { pattern: ".github/**", detail: "All files in .github directory" },
      { pattern: "test_*.py", detail: "Python test files" },
      { pattern: "*.log", detail: "Log files" },
      { pattern: "__pycache__/**", detail: "Python cache directories" },
      { pattern: "node_modules/**", detail: "Node.js modules directory" },
      { pattern: ".git/**", detail: "Git repository files" },
    ];

    return patterns.map((p) => {
      const item = new vscode.CompletionItem(p.pattern, vscode.CompletionItemKind.File);
      item.detail = p.detail;
      item.insertText = p.pattern;
      return item;
    });
  }

  private getContextCompletions(): vscode.CompletionItem[] {
    const contexts = [
      {
        name: "docs-only",
        detail: "Documentation files only",
        template: "docs-only]\n# Documentation files only\n## Review this documentation for clarity and completeness\n-**\n+*.md\n+docs/**\n$0",
      },
      {
        name: "signatures",
        detail: "Function and class signatures",
        template: 'signatures]\n# Function and class signatures\n@filter="signatures","^\\\\s*(def|class)\\\\s+","*.py"\n@output-line-numbers=false\n+*.py\n$0',
      },
      { name: "python-only", detail: "Python files only", template: "python-only]\n# Python files only\n+*.py\n$0" },
      { name: "tests", detail: "Test files only", template: "tests]\n# Test files only\n+test_*.py\n+tests/**\n$0" },
      {
        name: "backend",
        detail: "Backend code with inheritance",
        template:
          "backend:default]\n# Backend code (inherits from default)\n## Analyse backend code for performance and security issues\n+*.sql\n+migrations/**\n$0",
      },
      {
        name: "frontend",
        detail: "Frontend code with inheritance",
        template:
          "frontend:default]\n# Frontend code (inherits from default)\n## Focus on component structure and state management\n+*.js\n+*.jsx\n+*.vue\n+*.css\n$0",
      },
      {
        name: "security-review",
        detail: "Security-focused analysis",
        template:
          "security-review]\n# Security review context\n## This codebase represents a web application\n## Focus on security vulnerabilities including SQL injection and XSS\n## Pay special attention to authentication and authorization mechanisms\n+*.py\n+templates/*.html\n$0",
      },
      {
        name: "api-reference",
        detail: "API documentation context",
        template:
          'api-reference]\n# API reference documentation\n## This output contains public API interfaces and documentation\n@filter="public-classes","^\\\\s*class\\\\s+[A-Z]\\\\w*.*:","*.py"\n@filter="public-functions","^\\\\s*def\\\\s+[a-z_]\\\\w*.*:","*.py"\n@output-line-numbers=false\n+README.md\n+*.py\n$0',
      },
      { name: "custom", detail: "Custom context with inheritance", template: "${1:name}:${2:parent}]\n# ${3:Description}\n## ${4:LLM instruction}\n$0" },
      {
        name: "multiple-inheritance",
        detail: "Context with multiple inheritance",
        template: "${1:name}:${2:parent1},${3:parent2}]\n# ${4:Description}\n## ${5:LLM instruction}\n$0",
      },
    ];

    return contexts.map((ctx) => {
      const item = new vscode.CompletionItem(ctx.name + "]", vscode.CompletionItemKind.Module);
      item.detail = ctx.detail;
      item.insertText = new vscode.SnippetString(ctx.template);
      return item;
    });
  }
}

function parseFilterCSV(filterContent: string): string[] | null {
  const trimmed = filterContent.trim();

  // Must start and end with quotes to be CSV format
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return null;
  }

  try {
    // Use csv-parse to properly parse the CSV
    const records = parse(trimmed, {
      skip_empty_lines: true,
      quote: '"',
      delimiter: ",",
      escape: "\\",
    });

    // Should have exactly one row
    if (records.length !== 1) {
      return null;
    }

    const row = records[0] as string[];

    // Should have 2 or 3 columns
    if (row.length < 2 || row.length > 3) {
      return null;
    }

    // Validate that all segments are non-empty
    if (row.some((segment: string) => segment.trim() === "")) {
      return null;
    }

    return row;
  } catch (error) {
    return null;
  }
}
function validateBlobifyFile(document: vscode.TextDocument, diagnostics?: vscode.DiagnosticCollection): void {
  const diagnosticItems: vscode.Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split("\n");

  const contextNames = new Set<string>();
  const definedContexts = new Set<string>();
  // Always add 'default' as available for inheritance
  definedContexts.add("default");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    // Skip all comments (single and double hash)
    if (trimmedLine.startsWith("#")) {
      continue;
    }

    // Validate context headers (including inheritance)
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const contextContent = trimmedLine.slice(1, -1);

      // Check for inheritance syntax
      const inheritanceMatch = contextContent.match(/^([^:]+):(.+)$/);

      if (inheritanceMatch) {
        const contextName = inheritanceMatch[1].trim();
        const parentsList = inheritanceMatch[2];

        if (!contextName) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Empty context name", vscode.DiagnosticSeverity.Error));
        } else if (contextNames.has(contextName)) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Duplicate context name: ${contextName}`, vscode.DiagnosticSeverity.Error)
          );
        } else {
          contextNames.add(contextName);
          definedContexts.add(contextName);

          // Validate parent references
          const parents = parentsList
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p);
          for (const parent of parents) {
            if (!definedContexts.has(parent)) {
              diagnosticItems.push(
                new vscode.Diagnostic(
                  new vscode.Range(i, 0, i, line.length),
                  `Parent context '${parent}' not found. Contexts can only inherit from previously defined contexts or 'default'.`,
                  vscode.DiagnosticSeverity.Error
                )
              );
            }
          }

          if (contextName === "default") {
            diagnosticItems.push(
              new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Cannot redefine the 'default' context", vscode.DiagnosticSeverity.Error)
            );
          }
        }
      } else {
        // Regular context without inheritance
        const contextName = contextContent;
        if (!contextName) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Empty context name", vscode.DiagnosticSeverity.Error));
        } else if (contextNames.has(contextName)) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Duplicate context name: ${contextName}`, vscode.DiagnosticSeverity.Error)
          );
        } else {
          contextNames.add(contextName);
          definedContexts.add(contextName);

          if (contextName === "default") {
            diagnosticItems.push(
              new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Cannot redefine the 'default' context", vscode.DiagnosticSeverity.Error)
            );
          }
        }
      }
      continue;
    }

    // Validate filter options - support both CSV and legacy formats
    if (trimmedLine.startsWith("@filter=")) {
      const filterContent = trimmedLine.substring(8); // Remove "@filter="

      // Try to parse as CSV first
      const csvValues = parseFilterCSV(filterContent);

      if (csvValues && csvValues.length >= 2 && csvValues.length <= 3) {
        // Valid CSV format
        const filterName = csvValues[0];
        const regexPattern = csvValues[1];
        const filePattern = csvValues[2] || "*";

        if (!filterName.trim()) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Filter name cannot be empty", vscode.DiagnosticSeverity.Error));
        }

        try {
          // Handle escaped backslashes in regex patterns
          // In blobify CSV format, backslashes are escaped, so \\s becomes \s for regex
          const unescapedRegex = regexPattern.replace(/\\\\/g, "\\");
          new RegExp(unescapedRegex);
        } catch (e: any) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Invalid regex pattern: ${e.message}`, vscode.DiagnosticSeverity.Error)
          );
        }
      } else {
        // Try legacy format: @filter=name:regex
        const legacyMatch = filterContent.match(/^([^:]+):(.+)$/);
        if (legacyMatch) {
          const filterName = legacyMatch[1];
          const regexPattern = legacyMatch[2];

          if (!filterName.trim()) {
            diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Filter name cannot be empty", vscode.DiagnosticSeverity.Error));
          }

          try {
            // For legacy format, regex is not double-escaped
            new RegExp(regexPattern);
          } catch (e: any) {
            diagnosticItems.push(
              new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Invalid regex pattern: ${e.message}`, vscode.DiagnosticSeverity.Error)
            );
          }

          // Add suggestion to use CSV format
          diagnosticItems.push(
            new vscode.Diagnostic(
              new vscode.Range(i, 0, i, line.length),
              `Consider using CSV format: @filter="${filterName}","${regexPattern}","*.py"`,
              vscode.DiagnosticSeverity.Information
            )
          );
        } else {
          diagnosticItems.push(
            new vscode.Diagnostic(
              new vscode.Range(i, 0, i, line.length),
              'Invalid filter syntax. Use: @filter="name","regex" or @filter="name","regex","filepattern"',
              vscode.DiagnosticSeverity.Error
            )
          );
        }
      }
      continue;
    }

    // Validate other options
    if (trimmedLine.startsWith("@")) {
      const optionMatch = trimmedLine.match(/^@([a-zA-Z-_]+)(?:=(.+))?$/);
      if (!optionMatch) {
        diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Invalid option syntax", vscode.DiagnosticSeverity.Error));
      } else {
        const optionName = optionMatch[1];
        const optionValue = optionMatch[2];

        // Validate known boolean options
        const booleanOptions = [
          "copy-to-clipboard",
          "debug",
          "enable-scrubbing",
          "output-line-numbers",
          "output-index",
          "output-content",
          "output-metadata",
          "show-excluded",
          "suppress-timestamps",
        ];

        if (booleanOptions.includes(optionName) && optionValue && !["true", "false"].includes(optionValue)) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Option '${optionName}' must be 'true' or 'false'`, vscode.DiagnosticSeverity.Warning)
          );
        }

        if (optionName === "list-patterns" && optionValue && !["none", "ignored", "contexts"].includes(optionValue)) {
          diagnosticItems.push(
            new vscode.Diagnostic(
              new vscode.Range(i, 0, i, line.length),
              "Option 'list-patterns' must be 'none', 'ignored', or 'contexts'",
              vscode.DiagnosticSeverity.Warning
            )
          );
        }
      }
      continue;
    }

    // Validate patterns
    if (trimmedLine.startsWith("+") || trimmedLine.startsWith("-")) {
      const pattern = trimmedLine.slice(1).trim();
      if (!pattern) {
        diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Empty pattern", vscode.DiagnosticSeverity.Error));
      }
      continue;
    }

    // Invalid line
    diagnosticItems.push(
      new vscode.Diagnostic(
        new vscode.Range(i, 0, i, line.length),
        "Invalid syntax. Expected comment (#), LLM instruction (##), context ([name] or [name:parent]), option (@option=value), or pattern (+/-)",
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  if (diagnostics) {
    diagnostics.set(document.uri, diagnosticItems);
  }
}

export function deactivate() {}

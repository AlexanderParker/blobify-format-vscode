import * as vscode from "vscode";

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
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider("blobify", completionProvider, "@", "+", "-", "["));

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

    // Hover for filter options with regex
    if (text.startsWith("@")) {
      const filterMatch = text.match(/^@filter=([^:]+):(.+)$/);
      if (filterMatch) {
        const filterName = filterMatch[1];
        const regexPattern = filterMatch[2];

        let info = `**Content Filter**\n\nFilter: \`${filterName}\`\n\nRegex: \`${regexPattern}\`\n\n`;

        const regexInfo = this.explainRegex(regexPattern);
        if (regexInfo) {
          info += regexInfo + "\n\n";
        }

        const commonFilters = this.getCommonFilterExamples(filterName);
        if (commonFilters) {
          info += commonFilters;
        }

        return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
      }

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
      "list-patterns": "**List Patterns**\n\nList patterns and exit\n\n`@list-patterns=ignored` or `@list-patterns=contexts`",
      "output-filename": "**Output File**\n\nSpecify output file path\n\n`@output-filename=results.txt`",
      filter: "**Content Filter**\n\nExtract only lines matching regex pattern\n\n`@filter=name:regex`\n\nExample: `@filter=functions:^def\\\\s+`",
    };

    return options[optionName] || null;
  }

  private explainRegex(pattern: string): string {
    const explanations: string[] = [];

    if (pattern.includes("\\s+")) {
      explanations.push("• `\\\\s+` matches one or more whitespace characters");
    }
    if (pattern.includes("\\w+")) {
      explanations.push("• `\\\\w+` matches one or more word characters");
    }
    if (pattern.includes(".*")) {
      explanations.push("• `.*` matches any characters (greedy)");
    }
    if (pattern.includes("^")) {
      explanations.push("• `^` matches start of line");
    }
    if (pattern.includes("$")) {
      explanations.push("• `$` matches end of line");
    }
    if (pattern.includes("|")) {
      explanations.push("• `|` means OR (matches either pattern)");
    }

    if (pattern.includes("def\\s+")) {
      explanations.push("• Matches Python function definitions");
    }
    if (pattern.includes("class\\s+")) {
      explanations.push("• Matches Python class definitions");
    }
    if (pattern.includes("import\\s+") || pattern.includes("from\\s+.*import")) {
      explanations.push("• Matches Python import statements");
    }

    return explanations.length > 0 ? "**Regex Explanation:**\n" + explanations.join("\n") : "";
  }

  private getCommonFilterExamples(filterName: string): string {
    const examples: { [key: string]: string } = {
      signatures: "**Common Signatures:**\n```\n^(def|class)\\\\s+\n^def\\\\s+\\\\w+.*:\n```",
      functions: "**Function Patterns:**\n```\n^def\\\\s+\n^\\\\s*def\\\\s+\\\\w+\n```",
      imports: "**Import Patterns:**\n```\n^import\\\\s+\n^from\\\\s+.*import\n```",
    };

    return examples[filterName] || "";
  }
}

class BlobifyCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position);
    const text = line.text.substring(0, position.character);

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
      { name: "list-patterns", detail: "List patterns and exit", insertText: "list-patterns=${1|none,ignored,contexts|}", priority: 60 },
      { name: "output-filename", detail: "Output file path", insertText: "output-filename=${1:filename.txt}", priority: 55 },
      {
        name: "filter (signatures)",
        detail: "Python signatures",
        insertText: "filter=signatures:^\\\\s*(class\\\\s+\\\\w+.*:|def\\\\s+\\\\w+.*:|async\\\\s+def\\\\s+\\\\w+.*:)",
        priority: 50,
      },
      {
        name: "filter (functions)",
        detail: "Python functions",
        insertText: "filter=functions:^\\\\s*(def\\\\s+\\\\w+.*:|async\\\\s+def\\\\s+\\\\w+.*:)",
        priority: 45,
      },
      { name: "filter (classes)", detail: "Python classes", insertText: "filter=classes:^\\\\s*class\\\\s+\\\\w+.*:", priority: 40 },
      {
        name: "filter (imports)",
        detail: "Python imports",
        insertText: "filter=imports:^\\\\s*(from\\\\s+\\\\w+.*import.*|import\\\\s+\\\\w+.*)",
        priority: 35,
      },
      { name: "filter (returns)", detail: "Return statements", insertText: "filter=returns:^\\\\s*(return\\\\s+.*|yield\\\\s+.*)", priority: 30 },
      { name: "filter (decorators)", detail: "Python decorators", insertText: "filter=decorators:^\\\\s*@\\\\w+.*", priority: 25 },
      { name: "filter (constants)", detail: "Constants", insertText: "filter=constants:^\\\\s*[A-Z_][A-Z0-9_]*\\\\s*=.*", priority: 20 },
      {
        name: "filter (exceptions)",
        detail: "Exception handling",
        insertText: "filter=exceptions:^\\\\s*(raise\\\\s+.*|except\\\\s+.*:|try:|finally:)",
        priority: 15,
      },
      { name: "filter (custom)", detail: "Custom filter", insertText: "filter=${1:name}:${2:regex}", priority: 10 },
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
      { pattern: "*.md", detail: "Markdown files" },
      { pattern: "*.json", detail: "JSON files" },
      { pattern: "*.yaml", detail: "YAML files" },
      { pattern: "*.txt", detail: "Text files" },
      { pattern: "**", detail: "All files and directories" },
      { pattern: "docs/**", detail: "All files in docs directory" },
      { pattern: "src/**", detail: "All files in src directory" },
      { pattern: "tests/**", detail: "All files in tests directory" },
      { pattern: "test_*.py", detail: "Python test files" },
      { pattern: "*.log", detail: "Log files" },
      { pattern: "__pycache__/**", detail: "Python cache directories" },
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
      { name: "docs-only", detail: "Documentation files only", template: "docs-only]\n# Documentation files only\n-**\n+*.md\n+docs/**\n$0" },
      {
        name: "signatures",
        detail: "Function and class signatures",
        template: "signatures]\n# Function and class signatures\n@filter=signatures:^\\\\s*(def|class)\\\\s+\n@output-line-numbers=false\n+*.py\n$0",
      },
      { name: "python-only", detail: "Python files only", template: "python-only]\n# Python files only\n+*.py\n$0" },
      { name: "tests", detail: "Test files only", template: "tests]\n# Test files only\n+test_*.py\n+tests/**\n$0" },
      {
        name: "backend",
        detail: "Backend code with inheritance",
        template: "backend:default]\n# Backend code (inherits from default)\n+*.sql\n+migrations/**\n$0",
      },
      {
        name: "frontend",
        detail: "Frontend code with inheritance",
        template: "frontend:default]\n# Frontend code (inherits from default)\n+*.js\n+*.vue\n+*.css\n$0",
      },
      { name: "custom", detail: "Custom context with inheritance", template: "${1:name}:${2:parent}]\n# ${3:Description}\n$0" },
    ];

    return contexts.map((ctx) => {
      const item = new vscode.CompletionItem(ctx.name + "]", vscode.CompletionItemKind.Module);
      item.detail = ctx.detail;
      item.insertText = new vscode.SnippetString(ctx.template);
      return item;
    });
  }
}

function validateBlobifyFile(document: vscode.TextDocument, diagnostics?: vscode.DiagnosticCollection): void {
  const diagnosticItems: vscode.Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split("\n");

  const contextNames = new Set<string>();
  const definedContexts = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
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
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Duplicate context name: ${contextName}`, vscode.DiagnosticSeverity.Warning)
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
            if (parent !== "default" && !definedContexts.has(parent)) {
              diagnosticItems.push(
                new vscode.Diagnostic(
                  new vscode.Range(i, 0, i, line.length),
                  `Parent context '${parent}' not found. Contexts can only inherit from previously defined contexts.`,
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
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Duplicate context name: ${contextName}`, vscode.DiagnosticSeverity.Warning)
          );
        } else {
          contextNames.add(contextName);
          definedContexts.add(contextName);
        }
      }
      continue;
    }

    // Validate filter regex
    if (trimmedLine.startsWith("@filter=")) {
      const filterMatch = trimmedLine.match(/^@filter=([^:]+):(.+)$/);
      if (filterMatch) {
        const filterName = filterMatch[1];
        const regexPattern = filterMatch[2];

        if (!filterName.trim()) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Filter name cannot be empty", vscode.DiagnosticSeverity.Error));
        }

        try {
          new RegExp(regexPattern);
        } catch (e: any) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Invalid regex pattern: ${e.message}`, vscode.DiagnosticSeverity.Error)
          );
        }
      } else {
        diagnosticItems.push(
          new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Invalid filter syntax. Use: @filter=name:regex", vscode.DiagnosticSeverity.Error)
        );
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
        "Invalid syntax. Expected comment (#), context ([name] or [name:parent]), option (@option=value), or pattern (+/-)",
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  if (diagnostics) {
    diagnostics.set(document.uri, diagnosticItems);
  }
}

export function deactivate() {}

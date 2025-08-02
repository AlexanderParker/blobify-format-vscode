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

  // Register format command
  const formatCommand = vscode.commands.registerCommand("blobify.format", () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === "blobify") {
      vscode.commands.executeCommand("editor.action.formatDocument");
    }
  });

  // Register validation command
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
    const config = vscode.workspace.getConfiguration("blobify");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      let formattedLine = trimmedLine;

      // Create edit if line needs formatting
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

    // Hover for filter switches with regex
    if (text.startsWith("@")) {
      const filterMatch = text.match(/^@filter=([^:]+):(.+)$/);
      if (filterMatch) {
        const filterName = filterMatch[1];
        const regexPattern = filterMatch[2];

        let info = `**Content Filter**\n\nFilter: \`${filterName}\`\n\nRegex: \`${regexPattern}\`\n\n`;

        // Add regex explanation
        const regexInfo = this.explainRegex(regexPattern);
        if (regexInfo) {
          info += regexInfo + "\n\n";
        }

        // Add common filter examples
        const commonFilters = this.getCommonFilterExamples(filterName);
        if (commonFilters) {
          info += commonFilters;
        }

        return new vscode.Hover(new vscode.MarkdownString(info), new vscode.Range(position.line, 0, position.line, line.text.length));
      }

      const switchMatch = text.match(/^@([a-zA-Z-_]+)/);
      if (switchMatch) {
        const switchName = switchMatch[1];
        const switchInfo = this.getSwitchInfo(switchName);
        if (switchInfo) {
          return new vscode.Hover(new vscode.MarkdownString(switchInfo), new vscode.Range(position.line, 0, position.line, line.text.length));
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

    // Hover for contexts
    if (text.startsWith("[") && text.endsWith("]")) {
      const contextName = text.slice(1, -1);
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

    return null;
  }

  private getSwitchInfo(switchName: string): string | null {
    const switches: { [key: string]: string } = {
      debug: "**Debug Mode**\n\nEnable debug output for gitignore and .blobify processing\n\n`@debug`",
      noclean: "**Disable Scrubbing**\n\nDisable scrubadub processing of sensitive data\n\n`@noclean`",
      "no-line-numbers": "**No Line Numbers**\n\nDisable line numbers in file content output\n\n`@no-line-numbers`",
      "no-index": "**No Index**\n\nDisable file index section at start of output\n\n`@no-index`",
      "no-content": "**No Content**\n\nExclude file contents but include metadata\n\n`@no-content`",
      "no-metadata": "**No Metadata**\n\nExclude file metadata from output\n\n`@no-metadata`",
      clip: "**Copy to Clipboard**\n\nCopy output to clipboard\n\n`@clip`",
      "suppress-excluded": "**Suppress Excluded**\n\nSuppress excluded files from file contents section\n\n`@suppress-excluded`",
      output: "**Output File**\n\nSpecify output file path\n\n`@output=filename.txt`",
      filter: "**Content Filter**\n\nExtract only lines matching regex pattern\n\n`@filter=name:regex`\n\nExample: `@filter=functions:^def\\s+`",
    };

    return switches[switchName] || null;
  }

  private explainRegex(pattern: string): string {
    const explanations: string[] = [];

    // Common regex patterns
    if (pattern.includes("\\s+")) {
      explanations.push("• `\\s+` matches one or more whitespace characters");
    }
    if (pattern.includes("\\w+")) {
      explanations.push("• `\\w+` matches one or more word characters (letters, digits, underscore)");
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

    // Python-specific patterns
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
      explanations.push("• Matches Python return/yield statements");
    }

    return explanations.length > 0 ? "**Regex Explanation:**\n" + explanations.join("\n") : "";
  }

  private getCommonFilterExamples(filterName: string): string {
    const examples: { [key: string]: string } = {
      signatures: "**Common Signatures Patterns:**\n```\n^(def|class)\\s+\n^def\\s+\\w+.*:\n^class\\s+\\w+.*:\n```",
      functions: "**Function Patterns:**\n```\n^def\\s+\n^\\s*def\\s+\\w+\n^\\s*async\\s+def\\s+\n```",
      classes: "**Class Patterns:**\n```\n^class\\s+\n^\\s*class\\s+\\w+\n```",
      imports: "**Import Patterns:**\n```\n^import\\s+\n^from\\s+.*import\n^\\s*(import|from)\\s+\n```",
      returns: "**Return Patterns:**\n```\n^\\s*return\\s+\n^\\s*(return|yield)\\s+\n```",
      docstrings: "**Docstring Patterns:**\n```\n^\\s*\"\"\".*\n^\\s*'''.*\n```",
      comments: "**Comment Patterns:**\n```\n^\\s*#.*\n^\\s*//.*\n```",
      todos: "**TODO Patterns:**\n```\n(TODO|FIXME|XXX)\n#\\s*(TODO|FIXME)\n```",
    };

    return examples[filterName] || "";
  }
}

class BlobifyCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position);
    const text = line.text.substring(0, position.character);

    // Switch completions
    if (text.trim() === "@" || text.endsWith("@")) {
      return this.getSwitchCompletions();
    }

    // Pattern completions
    if (text.trim() === "+" || text.endsWith("+")) {
      return this.getPatternCompletions(true);
    }

    if (text.trim() === "-" || text.endsWith("-")) {
      return this.getPatternCompletions(false);
    }

    // Context completions
    if (text.trim() === "[" || text.endsWith("[")) {
      return this.getContextCompletions();
    }

    return [];
  }

  private getSwitchCompletions(): vscode.CompletionItem[] {
    // Order by frequency of use - most common first
    const switches = [
      { name: "clip", detail: "Copy to clipboard", priority: 100 },
      { name: "debug", detail: "Enable debug output", priority: 90 },
      { name: "no-line-numbers", detail: "Disable line numbers", priority: 80 },
      { name: "suppress-excluded", detail: "Suppress excluded files", priority: 70 },
      { name: "no-content", detail: "Exclude file contents", priority: 60 },
      { name: "no-metadata", detail: "Exclude file metadata", priority: 50 },
      { name: "no-index", detail: "Disable file index", priority: 40 },
      { name: "output", detail: "Output file path", insertText: "output=${1:filename.txt}", priority: 30 },
      { name: "noclean", detail: "Disable sensitive data scrubbing", priority: 20 },
    ];

    // Common filter completions - ordered by usefulness
    const filterCompletions = [
      {
        name: "filter (signatures)",
        detail: "Python signatures",
        insertText: "filter=signatures:^\\s*(class\\s+\\w+.*:|def\\s+\\w+.*:|async\\s+def\\s+\\w+.*:)",
        priority: 95,
      },
      { name: "filter (functions)", detail: "Python functions", insertText: "filter=functions:^\\s*def\\s+\\w+", priority: 85 },
      { name: "filter (imports)", detail: "Python imports", insertText: "filter=imports:^\\s*(from\\s+\\w+.*import.*|import\\s+\\w+.*)", priority: 75 },
      { name: "filter (classes)", detail: "Python classes", insertText: "filter=classes:^\\s*class\\s+\\w+", priority: 65 },
      { name: "filter (returns)", detail: "Python returns", insertText: "filter=returns:^\\s*(return\\s+.*|yield\\s+.*)", priority: 55 },
      { name: "filter (todos)", detail: "TODOs", insertText: "filter=todos:(TODO|FIXME|XXX)", priority: 45 },
      { name: "filter (comments)", detail: "Comments", insertText: "filter=comments:^\\s*#.*", priority: 35 },
      { name: "filter (docstrings)", detail: "Python docstrings", insertText: "filter=docstrings:^\\s*(\"\"\".*|'''.*)", priority: 25 },
      { name: "filter (type-hints)", detail: "Type hints", insertText: "filter=type-hints:.*:\\s*\\w+.*->.*|.*:\\s*[A-Z]\\w*\\[.*\\]", priority: 15 },
      { name: "filter (custom)", detail: "Custom filter", insertText: "filter=${1:name}:${2:regex}", priority: 10 },
    ];

    const allCompletions = [...switches, ...filterCompletions];

    return allCompletions
      .sort((a, b) => (b.priority || 0) - (a.priority || 0)) // Sort by priority descending
      .map((sw) => {
        const item = new vscode.CompletionItem(sw.name, sw.name.includes("filter") ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Property);
        item.detail = sw.detail;
        item.insertText = new vscode.SnippetString(sw.insertText || sw.name);

        // Set sort text to maintain order (VS Code uses lexicographic sorting by default)
        item.sortText = String(1000 - (sw.priority || 0)).padStart(4, "0");

        return item;
      });
  }

  private getPatternCompletions(isInclude: boolean): vscode.CompletionItem[] {
    const patterns = [
      { pattern: "*.py", detail: "Python files" },
      { pattern: "*.js", detail: "JavaScript files" },
      { pattern: "*.ts", detail: "TypeScript files" },
      { pattern: "*.md", detail: "Markdown files" },
      { pattern: "*.json", detail: "JSON files" },
      { pattern: "*.yaml", detail: "YAML files" },
      { pattern: "*.yml", detail: "YAML files" },
      { pattern: "*.txt", detail: "Text files" },
      { pattern: "*.log", detail: "Log files" },
      { pattern: "docs/**", detail: "All files in docs directory" },
      { pattern: "src/**", detail: "All files in src directory" },
      { pattern: "tests/**", detail: "All files in tests directory" },
      { pattern: "**", detail: "All files (use with caution)" },
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
      { name: "docs-only", detail: "Documentation files only" },
      { name: "signatures", detail: "Function and class signatures" },
      { name: "python-only", detail: "Python files only" },
      { name: "config-files", detail: "Configuration files only" },
      { name: "tests", detail: "Test files only" },
    ];

    return contexts.map((ctx) => {
      const item = new vscode.CompletionItem(ctx.name + "]", vscode.CompletionItemKind.Module);
      item.detail = ctx.detail;
      item.insertText = new vscode.SnippetString(`${ctx.name}]\n# ${ctx.detail}\n$0`);
      return item;
    });
  }
}

function validateBlobifyFile(document: vscode.TextDocument, diagnostics?: vscode.DiagnosticCollection): void {
  if (!vscode.workspace.getConfiguration("blobify").get<boolean>("validation.enabled", true)) {
    return;
  }

  const diagnosticItems: vscode.Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split("\n");

  let currentContext: string | null = null;
  const contextNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    // Validate context headers
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const contextName = trimmedLine.slice(1, -1);
      if (!contextName) {
        diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Empty context name", vscode.DiagnosticSeverity.Error));
      } else if (contextNames.has(contextName)) {
        diagnosticItems.push(
          new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Duplicate context name: ${contextName}`, vscode.DiagnosticSeverity.Warning)
        );
      } else {
        contextNames.add(contextName);
        currentContext = contextName;
      }
      continue;
    }

    // Validate switches
    if (trimmedLine.startsWith("@")) {
      const filterMatch = trimmedLine.match(/^@filter=([^:]+):(.+)$/);
      if (filterMatch) {
        const filterName = filterMatch[1];
        const regexPattern = filterMatch[2];

        // Validate filter name
        if (!filterName.trim()) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Filter name cannot be empty", vscode.DiagnosticSeverity.Error));
        }

        // Validate regex pattern
        try {
          new RegExp(regexPattern);
        } catch (e: any) {
          diagnosticItems.push(
            new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Invalid regex pattern: ${e.message}`, vscode.DiagnosticSeverity.Error)
          );
        }

        // Warn about potentially problematic patterns
        if (regexPattern.includes(".*.*") || regexPattern.includes(".+.+")) {
          diagnosticItems.push(
            new vscode.Diagnostic(
              new vscode.Range(i, 0, i, line.length),
              "Potentially inefficient regex pattern - multiple greedy quantifiers",
              vscode.DiagnosticSeverity.Warning
            )
          );
        }
      } else {
        const switchMatch = trimmedLine.match(/^@([a-zA-Z-_]+)(?:=(.+))?$/);
        if (!switchMatch) {
          diagnosticItems.push(new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), "Invalid switch syntax", vscode.DiagnosticSeverity.Error));
        } else {
          const switchName = switchMatch[1];
          const validSwitches = [
            "debug",
            "noclean",
            "no-line-numbers",
            "no-index",
            "no-content",
            "no-metadata",
            "clip",
            "suppress-excluded",
            "output",
            "filter",
          ];

          if (!validSwitches.includes(switchName)) {
            diagnosticItems.push(
              new vscode.Diagnostic(new vscode.Range(i, 0, i, line.length), `Unknown switch: ${switchName}`, vscode.DiagnosticSeverity.Warning)
            );
          }
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
        "Invalid syntax. Expected comment (#), context ([name]), switch (@switch), or pattern (+/-)",
        vscode.DiagnosticSeverity.Error
      )
    );
  }

  if (diagnostics) {
    diagnostics.set(document.uri, diagnosticItems);
  }
}

export function deactivate() {}

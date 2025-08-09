import * as vscode from "vscode";

export class BlobifyContextCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const line = document.lineAt(position);
    const lineText = line.text;
    const cursorChar = position.character;

    // Check if we're in a context header and just typed ':'
    if (!this.isInContextHeader(lineText, cursorChar)) {
      return undefined;
    }

    // Check if we just typed ':' and there's no parent defined yet
    if (!this.shouldTriggerInheritanceCompletion(lineText, cursorChar, context)) {
      return undefined;
    }

    // Get available parent contexts from above the current line
    const availableContexts = this.getAvailableParentContexts(document, position.line);

    if (availableContexts.length === 0) {
      return undefined;
    }

    // Create completion items
    const completionItems = availableContexts.map((contextName) => {
      const item = new vscode.CompletionItem(contextName, vscode.CompletionItemKind.Reference);
      item.detail = "Available parent context";
      item.documentation = `Inherit patterns and options from the '${contextName}' context`;
      item.sortText = contextName; // Alphabetical sorting
      return item;
    });

    return completionItems;
  }

  /**
   * Check if the cursor is within a context header line
   */
  private isInContextHeader(lineText: string, cursorPosition: number): boolean {
    const trimmed = lineText.trim();

    // Must start with [ and be a context header pattern
    if (!trimmed.startsWith("[")) {
      return false;
    }

    // Find the opening bracket position
    const openBracket = lineText.indexOf("[");

    // Cursor must be after the opening bracket
    return cursorPosition > openBracket;
  }

  /**
   * Determine if we should trigger inheritance completion
   */
  private shouldTriggerInheritanceCompletion(lineText: string, cursorPosition: number, context: vscode.CompletionContext): boolean {
    // Check if completion was triggered by typing ':'
    const triggerByColon = context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === ":";

    // Or if we're manually invoking completion and there's a ':' before cursor
    const hasColonBeforeCursor = lineText.substring(0, cursorPosition).includes(":");

    if (!triggerByColon && !hasColonBeforeCursor) {
      return false;
    }

    // Extract the part between [ and current position
    const openBracket = lineText.indexOf("[");
    if (openBracket === -1) {
      return false;
    }

    const contextPart = lineText.substring(openBracket + 1, cursorPosition);

    // Check if there's already a parent defined after the colon
    const colonIndex = contextPart.indexOf(":");
    if (colonIndex === -1) {
      return triggerByColon; // Only if we just typed the colon
    }

    // If there's already content after the colon, check if we're at the end
    // or if we're adding another parent (comma-separated)
    const afterColon = contextPart.substring(colonIndex + 1);

    // If there's content after colon, only trigger if we're adding another parent
    // (i.e., we just typed a comma or there's a comma before cursor)
    if (afterColon.trim().length > 0) {
      return afterColon.endsWith(",") || (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === ",");
    }

    return true;
  }

  /**
   * Extract available context names from lines above the current position
   */
  private getAvailableParentContexts(document: vscode.TextDocument, currentLine: number): string[] {
    const contexts: string[] = [];
    const contextPattern = /^\s*\[([^\]]+)\]/;

    // Scan from the top of the file to the current line (exclusive)
    for (let lineNum = 0; lineNum < currentLine; lineNum++) {
      const line = document.lineAt(lineNum);
      const lineText = line.text.trim();

      // Skip comments and empty lines
      if (lineText.startsWith("#") || lineText.length === 0) {
        continue;
      }

      const match = lineText.match(contextPattern);
      if (match) {
        const contextHeader = match[1].trim();

        // Extract just the context name (before any ':' for inheritance)
        const contextName = contextHeader.split(":")[0].trim();

        // Skip 'default' context and empty names
        if (contextName && contextName !== "default") {
          contexts.push(contextName);
        }
      }
    }

    // Remove duplicates and sort alphabetically
    return [...new Set(contexts)].sort();
  }
}

// Registration function for the extension
export function registerContextCompletionProvider(context: vscode.ExtensionContext) {
  const provider = new BlobifyContextCompletionProvider();

  const disposable = vscode.languages.registerCompletionItemProvider(
    { scheme: "file", pattern: "**/.blobify" }, // Only for .blobify files
    provider,
    ":", // Trigger on colon
    "," // Trigger on comma (for multiple inheritance)
  );

  context.subscriptions.push(disposable);
}

// Example of how to enhance with more advanced features
export class EnhancedBlobifyContextCompletionProvider extends BlobifyContextCompletionProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const basicCompletions = super.provideCompletionItems(document, position, token, context);

    if (!Array.isArray(basicCompletions)) {
      return basicCompletions;
    }

    // Enhance completion items with additional information
    const enhancedCompletions = basicCompletions.map((item) => {
      const contextInfo = this.getContextInfo(document, item.label as string);

      if (contextInfo) {
        item.detail = `Parent context (${contextInfo.lineNumber + 1})`;
        item.documentation = new vscode.MarkdownString(
          `**Context:** \`${item.label}\`\n\n` +
            `**Line:** ${contextInfo.lineNumber + 1}\n\n` +
            `**Description:** ${contextInfo.description || "No description available"}\n\n` +
            `Inherit patterns and configuration options from this context.`
        );
      }

      return item;
    });

    return enhancedCompletions;
  }

  /**
   * Get additional information about a context
   */
  private getContextInfo(
    document: vscode.TextDocument,
    contextName: string
  ): {
    lineNumber: number;
    description?: string;
  } | null {
    const contextPattern = new RegExp(`^\\s*\\[${this.escapeRegex(contextName)}(?::|\\])`);

    for (let lineNum = 0; lineNum < document.lineCount; lineNum++) {
      const line = document.lineAt(lineNum);

      if (contextPattern.test(line.text)) {
        // Look for description in comments above this context
        const description = this.getContextDescription(document, lineNum);

        return {
          lineNumber: lineNum,
          description,
        };
      }
    }

    return null;
  }

  /**
   * Extract context description from comments above the context definition
   */
  private getContextDescription(document: vscode.TextDocument, contextLine: number): string | undefined {
    const descriptions: string[] = [];

    // Look backwards for comments
    for (let lineNum = contextLine - 1; lineNum >= 0; lineNum--) {
      const line = document.lineAt(lineNum);
      const lineText = line.text.trim();

      // Stop at empty line or non-comment
      if (lineText === "" || !lineText.startsWith("#")) {
        break;
      }

      // Skip double-hash comments (LLM instructions)
      if (lineText.startsWith("##")) {
        continue;
      }

      // Extract comment text
      const commentText = lineText.substring(1).trim();
      if (commentText) {
        descriptions.unshift(commentText);
      }
    }

    return descriptions.length > 0 ? descriptions.join(" ") : undefined;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

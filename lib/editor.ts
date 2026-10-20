/** Markdown source edits keep the selection available for the next keystroke. */
export type EditorSelection = { value: string; start: number; end: number };
export type EditorCommand = "bold" | "italic" | "heading" | "quote" | "list" | "ordered" | "link" | "code" | "math" | "display-math";

export function insertEditorText(source: EditorSelection, text: string): EditorSelection {
  return { value: source.value.slice(0, source.start) + text + source.value.slice(source.end), start: source.start + text.length, end: source.start + text.length };
}

export function formatEditorSelection(source: EditorSelection, command: EditorCommand): EditorSelection {
  const { value, start, end } = source;
  const selected = value.slice(start, end);
  function wrap(before: string, after: string, placeholder: string): EditorSelection {
    if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
      const text = selected.slice(before.length, -after.length);
      return { value: value.slice(0, start) + text + value.slice(end), start, end: start + text.length };
    }
    if (value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
      return { value: value.slice(0, start - before.length) + selected + value.slice(end + after.length), start: start - before.length, end: end - before.length };
    }
    const text = selected || placeholder;
    return { value: value.slice(0, start) + before + text + after + value.slice(end), start: start + before.length, end: start + before.length + text.length };
  }
  if (command === "bold") return wrap("**", "**", "加粗文字");
  if (command === "italic") return wrap("_", "_", "斜体文字");
  if (command === "math") return wrap("$", "$", "x^2 + y^2 = r^2");
  if (command === "link") {
    const label = selected || "链接文字";
    const prefix = `[${label}](`;
    return { value: value.slice(0, start) + prefix + "https://)" + value.slice(end), start: start + prefix.length, end: start + prefix.length + 8 };
  }
  if (command === "code" || command === "display-math") {
    const text = selected || (command === "code" ? "代码" : "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}");
    if (command === "code" && !text.includes("\n")) {
      const runs = text.match(/`+/g) ?? [];
      const fence = "`".repeat(Math.max(1, ...runs.map(run => run.length + 1)));
      // Spaces let code containing backticks render correctly in CommonMark.
      const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
      return wrap(fence + padding, padding + fence, "代码");
    }
    const runs = text.match(/`+/g) ?? [];
    const fence = command === "code" ? "`".repeat(Math.max(3, ...runs.map(run => run.length + 1))) : "$$";
    const before = (start && value[start - 1] !== "\n" ? "\n\n" : "") + fence + "\n";
    const after = "\n" + fence + (end < value.length && value[end] !== "\n" ? "\n\n" : "\n");
    return { value: value.slice(0, start) + before + text + after + value.slice(end), start: start + before.length, end: start + before.length + text.length };
  }
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const lastSelected = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextNewline = value.indexOf("\n", lastSelected);
  const lineEnd = nextNewline < 0 ? value.length : nextNewline;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const pattern = command === "heading" ? /^#{1,6} / : command === "quote" ? /^> / : command === "list" ? /^[-*+] / : /^\d+\. /;
  const remove = lines.every(line => pattern.test(line));
  const text = lines.map((line, index) => remove ? line.replace(pattern, "") : (command === "heading" ? "## " : command === "quote" ? "> " : command === "list" ? "- " : `${index + 1}. `) + line).join("\n");
  const nextValue = value.slice(0, lineStart) + text + value.slice(lineEnd);
  if (start === end) {
    // Keep a bare caret after a newly inserted prefix so typing does not overwrite it.
    const caret = lineStart + Math.max(0, start - lineStart + text.length - lines[0].length);
    return { value: nextValue, start: caret, end: caret };
  }
  return { value: nextValue, start: lineStart, end: lineStart + text.length };
}

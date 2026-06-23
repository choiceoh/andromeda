// Dependency-free, XSS-safe Markdown → React renderer for Deneb's chat replies.
//
// Covers the subset the gateway actually emits: ATX headings, bold/italic,
// inline + fenced code, links (http/https/mailto only), ordered/unordered lists,
// blockquotes, GFM tables, and horizontal rules. Output is React elements
// (never dangerouslySetInnerHTML) so every text node is auto-escaped — no HTML
// sanitizer needed. Matches the repo's "dependency-free Icon set" idiom rather
// than pulling react-markdown + remark (and its build-script supply-chain gate).
import { type ReactNode, useState } from "react";
import { Icon } from "./Icon";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "para"; text: string };

const FENCE = /^```(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(?:---+|\*\*\*+|___+)\s*$/;
const QUOTE = /^>\s?(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

// Split a GFM table row into trimmed cells, dropping the outer pipes.
function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

// Line-based block parser. Blank lines separate paragraphs; fences, lists,
// quotes, and tables consume their own runs of consecutive lines.
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const lang = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // skip closing fence (or run off the end)
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    // Table: a pipe row immediately followed by a |---|---| separator.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, "$1"));
      blocks.push({ type: "quote", text: body.join("\n") });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) items.push(lines[i++].replace(LIST_ITEM, "$1"));
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !QUOTE.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push({ type: "para", text: para.join("\n") });
  }
  return blocks;
}

// Only these schemes are rendered as live links; anything else stays plain text
// so a `javascript:`/`data:` URL can never become a clickable element.
function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

// The earliest-match inline tokenizer: at each step find whichever of code /
// link / bold / italic opens first and emit the text before it, then recurse.
const INLINE = [
  { kind: "code", re: /`([^`]+)`/ },
  { kind: "link", re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
  { kind: "bold", re: /\*\*([^*]+)\*\*|__([^_]+)__/ },
  { kind: "italic", re: /\*([^*\n]+)\*|_([^_\n]+)_/ },
] as const;

function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    let best: { idx: number; len: number; kind: string; m: RegExpExecArray } | null = null;
    for (const { kind, re } of INLINE) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.idx)) best = { idx: m.index, len: m[0].length, kind, m };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.idx > 0) out.push(rest.slice(0, best.idx));
    const k = `${key}-${n++}`;
    if (best.kind === "code") {
      out.push(
        <code key={k} className="md-code">
          {best.m[1]}
        </code>,
      );
    } else if (best.kind === "link") {
      const href = safeHref(best.m[2]);
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {best.m[1]}
          </a>
        ) : (
          best.m[1]
        ),
      );
    } else if (best.kind === "bold") {
      out.push(<strong key={k}>{renderInline(best.m[1] ?? best.m[2], k)}</strong>);
    } else {
      out.push(<em key={k}>{renderInline(best.m[1] ?? best.m[2], k)}</em>);
    }
    rest = rest.slice(best.idx + best.len);
  }
  return out;
}

// A fenced code block with a copy affordance — the native client's code blocks
// are copyable, the single most-used chat action for shared snippets.
function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  }
  return (
    <div className="md-codeblock">
      <button type="button" className="md-copy" onClick={copy} aria-label="코드 복사">
        <Icon name="copy" size={13} />
        {copied ? "복사됨" : "복사"}
      </button>
      <pre>
        <code data-lang={lang || undefined}>{text}</code>
      </pre>
    </div>
  );
}

function renderBlock(b: Block, key: string): ReactNode {
  switch (b.type) {
    case "heading": {
      const Tag = `h${Math.min(b.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{renderInline(b.text, key)}</Tag>;
    }
    case "code":
      return <CodeBlock key={key} lang={b.lang} text={b.text} />;
    case "hr":
      return <hr key={key} />;
    case "quote":
      return <blockquote key={key}>{renderInline(b.text, key)}</blockquote>;
    case "list":
      return b.ordered ? (
        <ol key={key}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-${j}`)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table key={key} className="md-table">
          <thead>
            <tr>
              {b.header.map((h, j) => (
                <th key={j}>{renderInline(h, `${key}-h${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, j) => (
                  <td key={j}>{renderInline(c, `${key}-${r}-${j}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "para":
      return <p key={key}>{renderInline(b.text, key)}</p>;
  }
}

// Render assistant Markdown text as safe React nodes. Plain text with no Markdown
// renders as a single <p>, so a bare reply stays a clean paragraph.
export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return <div className="md">{blocks.map((b, i) => renderBlock(b, `b${i}`))}</div>;
}

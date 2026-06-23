// A single tool-call chip in the AI transcript: the visible half of two-way
// collaboration. A `started` frame shows a spinner; the matching `completed`
// frame (same toolUseId) flips it to a ✓ (or ✕ on error) and reveals the
// gateway's one-line `detail` (e.g. "메일 3건"). Mirrors the native client's
// inline tool rows.
import type { ToolPart } from "@/hooks";
import { Icon } from "./Icon";

// Humanize a raw tool id ("gmail.list_recent" → "gmail list recent") so the
// chip reads without a per-tool label table we don't have client-side.
function toolLabel(tool: string): string {
  return tool.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
}

export function ToolChip({ part }: { part: ToolPart }) {
  const done = part.state === "completed";
  const cls = "tool-chip" + (part.isError ? " error" : done ? " done" : " running");
  return (
    <div className={cls}>
      <span className="tool-chip-ico" aria-hidden="true">
        {!done ? (
          <span className="tool-spin" />
        ) : part.isError ? (
          <Icon name="close" size={12} />
        ) : (
          <Icon name="check" size={12} />
        )}
      </span>
      <span className="tool-chip-name">{toolLabel(part.tool)}</span>
      {part.detail ? <span className="tool-chip-detail">{part.detail}</span> : null}
    </div>
  );
}

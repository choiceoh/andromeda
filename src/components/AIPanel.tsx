import { useState } from "react";
import type { GatewayConfig } from "@/gateway";
import { useChat } from "@/hooks";
import { useWorkspace } from "@/workspaceContext";
import { Icon } from "./Icon";
import { ProactivePanel } from "./ProactivePanel";
import { paneLabel } from "./panes";

// Right floating panel: Deneb AI collaboration. Reads the active pane's pushed text
// from the workspace context and streams a reply; tool calls that mutate data
// refresh the active grid (handled in useChat).
export function AIPanel({ cfg }: { cfg: GatewayConfig }) {
  const { view, aiText, activeResource, connected } = useWorkspace();
  const { out, thinking, busy, send } = useChat(cfg);
  const [input, setInput] = useState("");

  function submit() {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    void send(msg, aiText, activeResource);
  }

  return (
    <aside
      className="panel"
      style={{ width: "var(--ai-w)", flex: "0 0 auto", display: "flex", flexDirection: "column", padding: "16px 16px" }}
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 13 }}>
        <span className="micro">Deneb AI</span>
        <span
          className={"live-dot" + (connected ? " pulse" : "")}
          style={{ marginLeft: "auto", background: connected ? "var(--online)" : "var(--faint)" }}
        />
      </div>

      <ProactivePanel cfg={cfg} />

      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 9, lineHeight: 1.5 }}>
        현재 뷰({paneLabel(view)})를 읽는 중 · 도구로 바꾸면 즉시 반영됩니다
      </div>

      {thinking && (
        <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginBottom: 9 }}>{thinking}…</div>
      )}

      <pre
        style={{
          flex: 1,
          whiteSpace: "pre-wrap",
          fontSize: 13,
          lineHeight: 1.7,
          margin: 0,
          color: "var(--ink-2)",
          fontFamily: "inherit",
          overflow: "auto",
        }}
      >
        {out || (busy ? "응답 대기 중…" : "메시지를 보내면 응답이 스트리밍됩니다.")}
      </pre>

      <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder={busy ? "응답 중…" : "메시지…"}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          className="btn btn-accent"
          onClick={submit}
          disabled={busy}
          aria-label="전송"
          style={{ width: 38, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </aside>
  );
}

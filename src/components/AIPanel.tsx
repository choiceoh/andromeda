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
  const { thinking, busy, turns, clear, send } = useChat(cfg);
  const [input, setInput] = useState("");
  const currentPane = paneLabel(view);
  const quickActions = [
    {
      label: "우선순위",
      prompt: `현재 ${currentPane} 화면을 보고, 지금 먼저 처리할 순서와 이유를 짧게 정리해줘.`,
    },
    {
      label: "요약",
      prompt: `현재 ${currentPane} 화면의 핵심만 한눈에 보이게 요약해줘.`,
    },
    {
      label: "후속 조치",
      prompt: `현재 ${currentPane} 화면에서 내가 바로 실행할 후속 조치를 뽑아줘.`,
    },
  ];

  function submit(message = input) {
    const msg = message.trim();
    if (!msg || busy || !connected) return;
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
        {turns.length > 0 && (
          <button
            className="row-btn"
            onClick={clear}
            disabled={busy}
            title="대화 지우기"
            aria-label="대화 지우기"
            style={{ marginLeft: 8, padding: 2, display: "inline-flex" }}
          >
            <Icon name="close" size={13} />
          </button>
        )}
        <span
          className={"live-dot" + (connected ? " pulse" : "")}
          style={{ marginLeft: "auto", background: connected ? "var(--online)" : "var(--faint)" }}
        />
      </div>

      <ProactivePanel cfg={cfg} />

      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 9, lineHeight: 1.5 }}>
        현재 뷰({currentPane})를 읽는 중 · 도구로 바꾸면 즉시 반영됩니다
      </div>

      <div className="ai-quick-actions" aria-label="빠른 지시">
        {quickActions.map((action) => (
          <button
            key={action.label}
            className="quick-action"
            onClick={() => submit(action.prompt)}
            disabled={busy || !connected}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="ai-transcript" role="log" aria-live="polite" aria-label="Deneb 대화">
        {turns.length === 0 ? (
          <div className="ai-empty">
            {connected ? "메시지를 보내면 대화가 여기에 쌓입니다." : "게이트웨이 연결 대기 중"}
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className={`ai-turn ${turn.role} ${turn.status}`}>
              <div className="ai-turn-label">{turn.role === "user" ? "나" : "Deneb"}</div>
              <div className="ai-turn-body">{turn.text || "응답 대기 중…"}</div>
            </div>
          ))
        )}
        {thinking && <div className="ai-thinking">{thinking}…</div>}
      </div>

      <form
        style={{ display: "flex", gap: 7, marginTop: 12, alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="field ai-compose"
          aria-label="Deneb에게 메시지"
          placeholder={busy ? "응답 중…" : "메시지…"}
          rows={3}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            submit();
          }}
        />
        <button
          type="submit"
          className="btn btn-accent"
          disabled={busy || !connected || input.trim().length === 0}
          aria-label="전송"
          style={{ width: 38, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="send" size={17} />
        </button>
      </form>
    </aside>
  );
}

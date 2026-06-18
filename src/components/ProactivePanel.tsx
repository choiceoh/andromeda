import type { GatewayConfig } from "../gateway";
import { useEvents } from "../hooks";
import { line } from "../theme";
import { useWorkspace } from "../workspaceContext";

// Proactive nudges pushed by Deneb (events SSE). Sits atop the AI panel; renders
// nothing until something arrives, so it stays out of the way when quiet.
export function ProactivePanel({ cfg }: { cfg: GatewayConfig }) {
  const { connected } = useWorkspace();
  const { events, dismiss } = useEvents(cfg, connected);
  if (events.length === 0) return null;

  return (
    <div style={{ borderBottom: line, paddingBottom: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>🔔 알림 {events.length}</div>
      <div style={{ display: "grid", gap: 6, maxHeight: 160, overflow: "auto" }}>
        {events.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{e.title ?? e.kind ?? "알림"}</div>
              {e.body && <div style={{ opacity: 0.7 }}>{e.body}</div>}
            </div>
            <button
              onClick={() => dismiss(e.id)}
              title="닫기"
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

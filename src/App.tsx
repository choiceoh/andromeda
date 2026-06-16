import { useEffect, useState } from "react";
import { type GatewayConfig, loadConfig, saveConfig, ping, chatStream } from "./gateway";

// Phase 0 skeleton: a 3-pane shell that proves the gateway connection.
//   left   — navigation/dashboard (filled in Phase 1 with Refine resources)
//   center — work area: here, the gateway connection form
//   right  — Deneb AI panel: live chat stream
export function App() {
  const [cfg, setCfg] = useState<GatewayConfig>(loadConfig());
  const [status, setStatus] = useState("미연결");
  const [chatInput, setChatInput] = useState("");
  const [chatOut, setChatOut] = useState("");
  const connected = Boolean(cfg.url && cfg.token);

  async function checkPing(c: GatewayConfig) {
    setStatus("확인 중…");
    try {
      const r = await ping(c);
      setStatus(r.ok ? `연결됨 · v${r.version ?? "?"} · ${r.model ?? ""}` : "ping 실패");
    } catch (e) {
      setStatus(`오류: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    if (connected) void checkPing(cfg);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput("");
    setChatOut("");
    try {
      await chatStream(cfg, msg, {
        onDelta: (t) => setChatOut((p) => p + t),
        onError: (e) => setChatOut((p) => `${p}\n[오류] ${e}`),
      });
    } catch (e) {
      setChatOut(`[오류] ${(e as Error).message}`);
    }
  }

  const pane: React.CSSProperties = { padding: 14, boxSizing: "border-box", overflow: "auto" };
  const line = "1px solid #2a2a2a";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 340px", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ ...pane, borderRight: line }}>
        <h3 style={{ margin: "2px 0 14px" }}>Andromeda</h3>
        <div style={{ opacity: 0.55, fontSize: 13, lineHeight: 1.8 }}>
          메일 · 일정 · 할일<br />연락처 · 위키
          <div style={{ marginTop: 10, opacity: 0.7 }}>(Phase 1)</div>
        </div>
      </nav>

      <main style={pane}>
        <h2 style={{ marginTop: 2 }}>게이트웨이 연결 <span style={{ opacity: 0.5, fontSize: 14 }}>(Phase 0)</span></h2>
        <div style={{ display: "grid", gap: 8, maxWidth: 540 }}>
          <input
            placeholder="게이트웨이 URL (http://…:18789)"
            value={cfg.url}
            onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
            style={{ padding: 8 }}
          />
          <input
            placeholder="클라이언트 토큰 (hex64)"
            value={cfg.token}
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })}
            style={{ padding: 8 }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => { saveConfig(cfg); void checkPing(cfg); }} style={{ padding: "8px 14px" }}>
              저장 + 연결 확인
            </button>
            <span style={{ fontSize: 14 }}>상태: {status}</span>
          </div>
        </div>
      </main>

      <aside style={{ ...pane, borderLeft: line, display: "flex", flexDirection: "column" }}>
        <h3 style={{ marginTop: 2 }}>데네브 AI</h3>
        <pre style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          {chatOut || "여기에 응답이 스트리밍됩니다."}
        </pre>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            style={{ flex: 1, padding: 8 }}
            placeholder="메시지…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          />
          <button onClick={() => void send()} style={{ padding: "8px 14px" }}>전송</button>
        </div>
      </aside>
    </div>
  );
}

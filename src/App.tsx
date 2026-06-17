import { useEffect, useMemo, useState } from "react";
import { Refine, useCreate, useDelete, useInvalidate, useList, useUpdate } from "@refinedev/core";
import { type GatewayConfig, loadConfig, saveConfig, ping, chatStream } from "./gateway";
import { collectWorkspaceContext, type WorkspaceView } from "./workspace";
import { denebDataProvider } from "./dataProvider";

interface Todo {
  id: string | number;
  title: string;
  done?: boolean;
  dueDate?: string;
}

// App owns the gateway config and wraps everything in <Refine> with the Deneb
// data provider. The actual workstation UI lives in <Workstation>, where Refine
// data hooks are available.
export function App() {
  const [cfg, setCfg] = useState<GatewayConfig>(loadConfig());
  const dataProvider = useMemo(() => denebDataProvider(cfg), [cfg]);
  return (
    <Refine dataProvider={dataProvider}>
      <Workstation cfg={cfg} setCfg={setCfg} />
    </Refine>
  );
}

const pane: React.CSSProperties = { padding: 14, boxSizing: "border-box", overflow: "auto" };
const lineColor = "#2a2a2a";
const line = `1px solid ${lineColor}`;
const field: React.CSSProperties = { padding: 8, background: "#1f1f1f", color: "#e8e8e8", border: line, borderRadius: 4 };

function Workstation({ cfg, setCfg }: { cfg: GatewayConfig; setCfg: (c: GatewayConfig) => void }) {
  const [status, setStatus] = useState("미연결");
  const [view, setView] = useState<"todo" | "doc">("todo");
  const [doc, setDoc] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatOut, setChatOut] = useState("");
  const [thinking, setThinking] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = Boolean(cfg.url && cfg.token);

  // The work area is backed by a Refine resource — same structured data renders to
  // the grid AND serializes to text for the AI. (Refine v5: { result, query }.)
  const { result, query } = useList<Todo>({
    resource: "todo",
    queryOptions: { enabled: connected },
  });
  const todos = result?.data ?? [];
  const { mutate: createTodo } = useCreate();
  const { mutate: updateTodo } = useUpdate();
  const { mutate: deleteTodo } = useDelete();
  const invalidate = useInvalidate();

  async function checkPing(c: GatewayConfig) {
    setStatus("확인 중…");
    try {
      const r = await ping(c);
      setStatus(r.ok ? `연결됨 · v${r.version ?? "?"}` : "ping 실패");
    } catch (e) {
      setStatus(`오류: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    if (connected) void checkPing(cfg);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: ⌘/Ctrl+1 = 할일, ⌘/Ctrl+2 = 문서 (desktop muscle memory).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") {
        e.preventDefault();
        setView("todo");
      } else if (e.key === "2") {
        e.preventDefault();
        setView("doc");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function addTodo() {
    const title = newTodo.trim();
    if (!title) return;
    setNewTodo("");
    createTodo({ resource: "todo", values: { title } }, { onSuccess: () => void query.refetch() });
  }

  function toggleTodo(t: Todo) {
    updateTodo({ resource: "todo", id: t.id, values: { done: !t.done } }, { onSuccess: () => void query.refetch() });
  }

  function removeTodo(t: Todo) {
    deleteTodo({ resource: "todo", id: t.id }, { onSuccess: () => void query.refetch() });
  }

  // Serialize the ACTIVE view to text so Deneb's AI reads it (no vision needed).
  function activeContext(): string {
    const views: WorkspaceView[] = [];
    if (view === "doc") {
      views.push({ serializeForAI: () => (doc.trim() ? `[문서]\n${doc}` : "") });
    } else {
      views.push({
        serializeForAI: () =>
          todos.length
            ? `[할일 ${todos.length}건]\n` +
              todos
                .map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.dueDate ? ` (마감 ${t.dueDate})` : ""}`)
                .join("\n")
            : "",
      });
    }
    return collectWorkspaceContext(views);
  }

  async function send() {
    const msg = chatInput.trim();
    if (!msg || busy) return;
    setChatInput("");
    setChatOut("");
    setThinking("");
    setBusy(true);
    try {
      await chatStream(
        cfg,
        msg,
        {
          onThinking: (preview) => setThinking(preview.slice(0, 90)),
          onDelta: (t) => {
            setThinking("");
            setChatOut((p) => p + t);
          },
          // Show the AI using tools — the visible half of two-way collaboration.
          onTool: (ev) => {
            const e = ev as { state?: string; tool?: string };
            if (e.state === "started" && e.tool) setChatOut((p) => `${p}\n[🔧 ${e.tool}]\n`);
          },
          // The AI may have changed back-end data via a tool — refresh so the grid reflects it.
          onDone: () => {
            if (view === "todo") invalidate({ resource: "todo", invalidates: ["list"] });
          },
          onError: (e) => setChatOut((p) => `${p}\n[오류] ${e}`),
        },
        "client:main",
        activeContext(),
      );
    } catch (e) {
      setChatOut(`[오류] ${(e as Error).message}`);
    } finally {
      setThinking("");
      setBusy(false);
    }
  }

  const navBtn = (active: boolean): React.CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    textAlign: "left",
    padding: "6px 8px",
    marginBottom: 4,
    background: active ? "#2a2a2a" : "transparent",
    color: "#e8e8e8",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  });
  const kbd: React.CSSProperties = { opacity: 0.4, fontSize: 11 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "210px 1fr 340px", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ ...pane, borderRight: line, display: "flex", flexDirection: "column" }}>
        <h3 style={{ margin: "2px 0 12px" }}>Andromeda</h3>
        <button style={navBtn(view === "todo")} onClick={() => setView("todo")}>
          <span>할일</span><span style={kbd}>⌘1</span>
        </button>
        <button style={navBtn(view === "doc")} onClick={() => setView("doc")}>
          <span>문서</span><span style={kbd}>⌘2</span>
        </button>
        <div style={{ opacity: 0.45, fontSize: 12, marginTop: 8 }}>메일 · 일정 · 위키 (다음)</div>

        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: line, display: "grid", gap: 6 }}>
          <input placeholder="게이트웨이 URL" value={cfg.url}
            onChange={(e) => setCfg({ ...cfg, url: e.target.value })} style={{ ...field, fontSize: 12 }} />
          <input placeholder="클라이언트 토큰" value={cfg.token}
            onChange={(e) => setCfg({ ...cfg, token: e.target.value })} style={{ ...field, fontSize: 12 }} />
          <button onClick={() => { saveConfig(cfg); void checkPing(cfg); }} style={{ padding: "6px 10px" }}>
            연결
          </button>
          <span style={{ fontSize: 12, opacity: 0.7, color: status.startsWith("오류") ? "#e0a0a0" : undefined }}>{status}</span>
        </div>
      </nav>

      <main style={{ ...pane }}>
        {view === "todo" ? (
          <>
            <h2 style={{ marginTop: 2 }}>할일</h2>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, maxWidth: 540 }}>
              <input style={{ ...field, flex: 1 }} placeholder="새 할일…" value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }} />
              <button onClick={addTodo} style={{ padding: "8px 14px" }}>추가</button>
            </div>
            {!connected ? (
              <p style={{ opacity: 0.6 }}>게이트웨이에 연결하면 할일이 표시됩니다 (좌측 하단).</p>
            ) : query.isLoading ? (
              <p style={{ opacity: 0.6 }}>불러오는 중…</p>
            ) : todos.length === 0 ? (
              <p style={{ opacity: 0.6 }}>할일이 없습니다.</p>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 680 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 13 }}>
                    <th style={{ padding: "6px 8px", width: 40 }}>완료</th>
                    <th style={{ padding: "6px 8px" }}>제목</th>
                    <th style={{ padding: "6px 8px", width: 110 }}>마감</th>
                    <th style={{ padding: "6px 8px", width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {todos.map((t) => (
                    <tr key={String(t.id)} style={{ borderTop: line }}>
                      <td style={{ padding: "6px 8px" }}>
                        <input type="checkbox" checked={Boolean(t.done)} onChange={() => toggleTodo(t)} />
                      </td>
                      <td style={{ padding: "6px 8px", textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>
                        {t.title}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: 13, opacity: 0.7 }}>{t.dueDate ?? ""}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <button onClick={() => removeTodo(t)} title="삭제"
                          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 15 }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 2 }}>문서</h2>
            <textarea
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              placeholder="여기에 문서를 작성하세요. 우측 AI가 이 내용을 텍스트로 읽습니다."
              style={{ ...field, width: "100%", height: "70vh", boxSizing: "border-box", resize: "none", fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.5 }}
            />
          </>
        )}
      </main>

      <aside style={{ ...pane, borderLeft: line, display: "flex", flexDirection: "column" }}>
        <h3 style={{ marginTop: 2 }}>데네브 AI</h3>
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>
          현재 뷰({view === "todo" ? "할일" : "문서"})를 읽고, 도구로 바꾸면 즉시 반영됩니다
        </div>
        {thinking && (
          <div style={{ fontSize: 12, opacity: 0.6, fontStyle: "italic", marginBottom: 6 }}>🤔 {thinking}…</div>
        )}
        <pre style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          {chatOut || (busy ? "응답 대기 중…" : "메시지를 보내면 응답이 스트리밍됩니다.")}
        </pre>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input style={{ ...field, flex: 1 }} placeholder={busy ? "응답 중…" : "메시지…"} value={chatInput}
            disabled={busy}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
          <button onClick={() => void send()} disabled={busy} style={{ padding: "8px 14px" }}>전송</button>
        </div>
      </aside>
    </div>
  );
}

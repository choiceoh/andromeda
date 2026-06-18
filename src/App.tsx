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

// Back-end row shapes are dynamic (gateway RPC payloads), so these list only the
// fields the grids read, all optional — display/serialization fall back gracefully.
interface Mail {
  id: string | number;
  subject?: string;
  from?: unknown; // string or { name, email }
  sender?: unknown;
  date?: string;
  snippet?: string;
  unread?: boolean;
}
interface CalEvent {
  id: string | number;
  title?: string;
  summary?: string;
  // Google Calendar-shaped events nest the timestamp as { dateTime } or { date }.
  start?: string | { dateTime?: string; date?: string };
  end?: string | { dateTime?: string; date?: string };
  location?: string;
}

type View = "todo" | "doc" | "mail" | "calendar";

const VIEW_LABEL: Record<View, string> = { todo: "할일", doc: "문서", mail: "메일", calendar: "일정" };

// Coerce a possibly-structured field (e.g. mail `from`) to a short label.
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // `??` would keep an empty-string `name` and hide a present email — pick the
    // first NON-empty field instead so `{ name: "", email }` still shows the email.
    for (const k of ["name", "email", "title"]) {
      const s = o[k];
      if (typeof s === "string" && s.trim()) return s;
    }
    return "";
  }
  return String(v);
}

// Render an ISO-ish timestamp compactly; pass through anything unparseable.
function fmtDate(v?: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// A calendar timestamp is a bare ISO string or a { dateTime } / { date } object.
// `date` (no time) marks an all-day event, which must NOT go through new Date()'s
// UTC-midnight parsing or it shifts a day in western zones.
function calStamp(v: unknown): { iso?: string; allDay: boolean } {
  if (typeof v === "string") return { iso: v, allDay: /^\d{4}-\d{2}-\d{2}$/.test(v) };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.dateTime === "string") return { iso: o.dateTime, allDay: false };
    if (typeof o.date === "string") return { iso: o.date, allDay: true };
  }
  return { allDay: false };
}

// Format an all-day YYYY-MM-DD in LOCAL terms (date only, no UTC shift, no time).
// `offsetDays` lets callers step back Google's exclusive all-day end.date.
function fmtDay(ymd: string, offsetDays = 0): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return fmtDate(ymd);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + offsetDays);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Human span for a calendar event. All-day events render date-only with the
// exclusive end stepped back to the last inclusive day; timed events show time.
function calSpan(start: unknown, end: unknown): string {
  const s = calStamp(start);
  if (s.allDay && s.iso) {
    const e = calStamp(end);
    const startDay = fmtDay(s.iso);
    const endDay = e.iso ? fmtDay(e.iso, -1) : ""; // end.date is exclusive → -1 day
    return !endDay || endDay === startDay ? startDay : `${startDay} ~ ${endDay}`;
  }
  return [s.iso ? fmtDate(s.iso) : "", calStamp(end).iso ? fmtDate(calStamp(end).iso!) : ""]
    .filter(Boolean)
    .join(" ~ ");
}

// Best-effort message from a Refine/HttpError (a plain object with `message`) or any throwable.
function errText(e: unknown): string {
  if (!e) return "알 수 없는 오류";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
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
  const [view, setView] = useState<View>("todo");
  const [doc, setDoc] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatOut, setChatOut] = useState("");
  const [thinking, setThinking] = useState("");
  const [busy, setBusy] = useState(false);
  const connected = Boolean(cfg.url && cfg.token);

  // Each grid is backed by a Refine resource — the same structured data renders to
  // the grid AND serializes to text for the AI. (Refine v5: { result, query }.)
  // Only the active resource fetches, so switching panes drives the network.
  const { result, query } = useList<Todo>({
    resource: "todo",
    queryOptions: { enabled: connected && view === "todo" },
  });
  const todos = result?.data ?? [];
  const { result: mailResult, query: mailQuery } = useList<Mail>({
    resource: "mail",
    queryOptions: { enabled: connected && view === "mail" },
  });
  const mails = mailResult?.data ?? [];
  const { result: calResult, query: calQuery } = useList<CalEvent>({
    resource: "calendar",
    queryOptions: { enabled: connected && view === "calendar" },
  });
  const events = calResult?.data ?? [];
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

  // Keyboard shortcuts: ⌘/Ctrl+1..4 switch panes (desktop muscle memory).
  useEffect(() => {
    const byKey: Record<string, View> = { "1": "todo", "2": "doc", "3": "mail", "4": "calendar" };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const next = byKey[e.key];
      if (!next) return;
      e.preventDefault();
      setView(next);
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
    const serialize = (): string => {
      switch (view) {
        case "doc":
          return doc.trim() ? `[문서]\n${doc}` : "";
        case "mail":
          return mails.length
            ? `[메일 ${mails.length}건]\n` +
                mails
                  .map((m) => {
                    const who = text(m.from) || text(m.sender);
                    const head = `- ${m.unread ? "● " : ""}${m.subject ?? "(제목 없음)"}${who ? ` · ${who}` : ""}${
                      m.date ? ` · ${fmtDate(m.date)}` : ""
                    }`;
                    // Mirror the grid, which also shows the snippet, so the AI sees what the user sees.
                    return m.snippet ? `${head}\n    ${m.snippet}` : head;
                  })
                  .join("\n")
            : "";
        case "calendar":
          return events.length
            ? `[일정 ${events.length}건]\n` +
                events
                  .map((ev) => {
                    const span = calSpan(ev.start, ev.end);
                    return `- ${ev.title ?? ev.summary ?? "(제목 없음)"}${span ? ` (${span})` : ""}${
                      ev.location ? ` @${ev.location}` : ""
                    }`;
                  })
                  .join("\n")
            : "";
        default:
          return todos.length
            ? `[할일 ${todos.length}건]\n` +
                todos
                  .map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.dueDate ? ` (마감 ${t.dueDate})` : ""}`)
                  .join("\n")
            : "";
      }
    };
    const v: WorkspaceView = { serializeForAI: serialize };
    return collectWorkspaceContext([v]);
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
          // The AI may have changed back-end data via a tool — refresh the active
          // grid so it reflects the change (doc has no resource to invalidate).
          onDone: () => {
            if (view !== "doc") invalidate({ resource: view, invalidates: ["list"] });
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
  const muted: React.CSSProperties = { opacity: 0.6 };
  const th: React.CSSProperties = { padding: "6px 8px" };
  const td: React.CSSProperties = { padding: "6px 8px" };

  // Shared disconnected/error/loading/empty notice for a grid; null means "show the
  // table". Error is checked BEFORE empty so a failed RPC isn't shown as "no data".
  function gridNotice(
    q: { isLoading: boolean; isError?: boolean; error?: unknown },
    count: number,
    empty: string,
  ): React.ReactNode {
    if (!connected) return <p style={muted}>게이트웨이에 연결하면 표시됩니다 (좌측 하단).</p>;
    if (q.isError) return <p style={{ ...muted, color: "#e0a0a0" }}>불러오기 실패: {errText(q.error)}</p>;
    if (q.isLoading) return <p style={muted}>불러오는 중…</p>;
    if (count === 0) return <p style={muted}>{empty}</p>;
    return null;
  }

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
        <button style={navBtn(view === "mail")} onClick={() => setView("mail")}>
          <span>메일</span><span style={kbd}>⌘3</span>
        </button>
        <button style={navBtn(view === "calendar")} onClick={() => setView("calendar")}>
          <span>일정</span><span style={kbd}>⌘4</span>
        </button>
        <div style={{ opacity: 0.45, fontSize: 12, marginTop: 8 }}>위키 · 검색 (다음)</div>

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
        {view === "todo" && (
          <>
            <h2 style={{ marginTop: 2 }}>할일</h2>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, maxWidth: 540 }}>
              <input style={{ ...field, flex: 1 }} placeholder="새 할일…" value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }} />
              <button onClick={addTodo} style={{ padding: "8px 14px" }}>추가</button>
            </div>
            {gridNotice(query, todos.length, "할일이 없습니다.") ?? (
              <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 680 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 13 }}>
                    <th style={{ ...th, width: 40 }}>완료</th>
                    <th style={th}>제목</th>
                    <th style={{ ...th, width: 110 }}>마감</th>
                    <th style={{ ...th, width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {todos.map((t) => (
                    <tr key={String(t.id)} style={{ borderTop: line }}>
                      <td style={td}>
                        <input type="checkbox" checked={Boolean(t.done)} onChange={() => toggleTodo(t)} />
                      </td>
                      <td style={{ ...td, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>
                        {t.title}
                      </td>
                      <td style={{ ...td, fontSize: 13, opacity: 0.7 }}>{t.dueDate ?? ""}</td>
                      <td style={td}>
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
        )}

        {view === "doc" && (
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

        {view === "mail" && (
          <>
            <h2 style={{ marginTop: 2 }}>메일</h2>
            {gridNotice(mailQuery, mails.length, "메일이 없습니다.") ?? (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 13 }}>
                    <th style={{ ...th, width: 180 }}>보낸이</th>
                    <th style={th}>제목</th>
                    <th style={{ ...th, width: 130 }}>날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {mails.map((m) => {
                    const who = text(m.from) || text(m.sender);
                    const unread = Boolean(m.unread);
                    return (
                      <tr key={String(m.id)} style={{ borderTop: line, fontWeight: unread ? 600 : 400 }}>
                        <td style={{ ...td, fontSize: 13, opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                          {unread && <span style={{ color: "#6aa0ff", marginRight: 4 }}>●</span>}{who || "—"}
                        </td>
                        <td style={td}>
                          <div>{m.subject ?? "(제목 없음)"}</div>
                          {m.snippet && <div style={{ fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 }}>{m.snippet}</div>}
                        </td>
                        <td style={{ ...td, fontSize: 13, opacity: 0.7, whiteSpace: "nowrap" }}>{fmtDate(m.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {view === "calendar" && (
          <>
            <h2 style={{ marginTop: 2 }}>일정</h2>
            {gridNotice(calQuery, events.length, "다가오는 일정이 없습니다.") ?? (
              <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 760 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.6, fontSize: 13 }}>
                    <th style={{ ...th, width: 240 }}>시간</th>
                    <th style={th}>일정</th>
                    <th style={{ ...th, width: 160 }}>장소</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => {
                    const span = calSpan(ev.start, ev.end);
                    return (
                      <tr key={String(ev.id)} style={{ borderTop: line }}>
                        <td style={{ ...td, fontSize: 13, opacity: 0.8, whiteSpace: "nowrap" }}>{span || "—"}</td>
                        <td style={td}>{ev.title ?? ev.summary ?? "(제목 없음)"}</td>
                        <td style={{ ...td, fontSize: 13, opacity: 0.7 }}>{ev.location ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>

      <aside style={{ ...pane, borderLeft: line, display: "flex", flexDirection: "column" }}>
        <h3 style={{ marginTop: 2 }}>데네브 AI</h3>
        <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>
          현재 뷰({VIEW_LABEL[view]})를 읽고, 도구로 바꾸면 즉시 반영됩니다
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

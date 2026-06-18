import { useList } from "@refinedev/core";
import type { CalEvent, Mail, Todo, View, WorkItem } from "@/types";
import { calSpan, text } from "@/format";
import { color, line, muted } from "@/theme";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { GridNotice } from "@/components/Grid";

// "오늘" dashboard — the workstation's landing pane. It adds NO new gateway
// plumbing: it fans out the existing list resources (calendar/mail/todo/workfeed)
// through the data provider, shows the top items per section as compact cards, and
// serializes the whole briefing to the AI panel via useRegisterPane. Prioritizing
// ("오늘 뭐부터?") is delegated to Deneb through that text projection — not done here.

const MAX = 6; // a briefing is a glance; the full list lives in each resource's own pane.

interface Brief {
  label: string;
  view: View;
  empty: string;
  total: number; // relevant items before the cap — shown in the card title and AI header
  lines: string[]; // up to MAX compact one-liners (what the AI reads === what's on screen)
  query: { isLoading: boolean; isError?: boolean; error?: unknown };
}

// One briefing section as text: counted header + capped lines + overflow note.
function sectionText(b: Brief): string {
  if (b.total === 0) return "";
  const more = b.total > b.lines.length ? `\n- …외 ${b.total - b.lines.length}건` : "";
  return `[${b.label} ${b.total}건]\n` + b.lines.map((l) => `- ${l}`).join("\n") + more;
}

export function TodayPane() {
  const { connected, setView } = useWorkspace();
  const cal = useList<CalEvent>({ resource: "calendar", queryOptions: { enabled: connected } });
  const mail = useList<Mail>({ resource: "mail", queryOptions: { enabled: connected } });
  const todo = useList<Todo>({ resource: "todo", queryOptions: { enabled: connected } });
  const work = useList<WorkItem>({ resource: "workfeed", queryOptions: { enabled: connected } });

  const events = cal.result?.data ?? [];
  // Recent mail, unread first — robust if `unread` is absent (order is just preserved).
  const mails = [...(mail.result?.data ?? [])].sort((a, b) => Number(Boolean(b.unread)) - Number(Boolean(a.unread)));
  // Open todos, soonest due first; missing/unparseable due dates sink to the bottom.
  const due = (s?: string) => {
    if (!s) return Infinity;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? Infinity : t;
  };
  const todos = (todo.result?.data ?? []).filter((t) => !t.done).sort((a, b) => due(a.dueDate) - due(b.dueDate));
  const items = work.result?.data ?? [];

  const briefs: Brief[] = [
    {
      label: "일정",
      view: "calendar",
      empty: "다가오는 일정 없음",
      query: cal.query,
      total: events.length,
      lines: events.slice(0, MAX).map((ev) => {
        const span = calSpan(ev.start, ev.end);
        return `${ev.title ?? ev.summary ?? "(제목 없음)"}${span ? ` · ${span}` : ""}`;
      }),
    },
    {
      label: "메일",
      view: "mail",
      empty: "메일 없음",
      query: mail.query,
      total: mails.length,
      lines: mails.slice(0, MAX).map((m) => {
        const who = text(m.from) || text(m.sender);
        return `${m.unread ? "● " : ""}${m.subject ?? "(제목 없음)"}${who ? ` · ${who}` : ""}`;
      }),
    },
    {
      label: "할일",
      view: "todo",
      empty: "할일 없음",
      query: todo.query,
      total: todos.length,
      lines: todos.slice(0, MAX).map((t) => `${t.title}${t.dueDate ? ` · 마감 ${t.dueDate}` : ""}`),
    },
    {
      label: "작업피드",
      view: "workfeed",
      empty: "작업피드 비어 있음",
      query: work.query,
      total: items.length,
      lines: items.slice(0, MAX).map((w) => `${w.title ?? w.summary ?? "(항목)"}${w.kind ? ` · ${w.kind}` : ""}`),
    },
  ];

  // The full briefing the AI panel reads — exactly what's on screen, as text.
  const body = briefs.map(sectionText).filter(Boolean).join("\n\n");
  useRegisterPane(undefined, body ? `[오늘 브리핑]\n${body}` : "");

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "short" });

  return (
    <>
      <h2 style={{ marginTop: 2 }}>
        오늘 <span style={{ ...muted, fontSize: 14, fontWeight: 400 }}>{today}</span>
      </h2>
      <p style={{ ...muted, marginTop: -4, fontSize: 13 }}>
        우측 AI 패널에 “오늘 뭐부터?”라고 물어보세요 — 데네브가 아래 컨텍스트로 우선순위를 제안합니다.
      </p>
      {!connected ? (
        <p style={muted}>게이트웨이에 연결하면 표시됩니다 (좌측 하단).</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            maxWidth: 880,
          }}
        >
          {briefs.map((b) => (
            <Card key={b.label} brief={b} onNav={() => setView(b.view)} />
          ))}
        </div>
      )}
    </>
  );
}

function Card({ brief, onNav }: { brief: Brief; onNav: () => void }) {
  const { label, total, lines, empty, query } = brief;
  return (
    <section
      style={{
        border: line,
        borderRadius: 6,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <button
        onClick={onNav}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          marginBottom: 8,
          color: color.text,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span>
          {label} {total > 0 && <span style={muted}>{total}</span>}
        </span>
        <span style={{ opacity: 0.4 }}>→</span>
      </button>
      <GridNotice query={query} count={lines.length} empty={empty}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {l}
            </div>
          ))}
          {total > lines.length && <div style={{ ...muted, fontSize: 12 }}>…외 {total - lines.length}건</div>}
        </div>
      </GridNotice>
    </section>
  );
}

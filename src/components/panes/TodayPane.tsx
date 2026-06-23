import type { CalEvent, Mail, Todo, View, WorkItem } from "@/types";
import { useCachedList } from "@/cachedList";
import { calSpan, eventDayKeys, fmtDate, text } from "@/format";
import { Icon } from "@/components/Icon";
import { GridNotice } from "@/components/Grid";
import { type PaneTarget, useRegisterPane, useWorkspace } from "@/workspaceContext";

// "오늘" dashboard — the workstation's landing pane. It adds NO new gateway
// plumbing: it fans out the existing list resources (calendar/mail/todo/workfeed)
// through the data provider, shows the top items per section as compact briefings,
// and serializes the whole briefing to the AI panel via useRegisterPane.
// Prioritizing ("오늘 뭐부터?") is delegated to Deneb through that text projection.

const MAX = 6; // a briefing is a glance; the full list lives in each resource's own pane.

interface Brief {
  label: string;
  view: View;
  empty: string;
  total: number; // relevant items before the cap — shown in the header and AI projection
  lines: BriefLine[]; // up to MAX compact one-liners (what the AI reads === what's on screen)
  query: { isLoading: boolean; isError?: boolean; error?: unknown };
}

interface BriefLine {
  text: string;
  target?: PaneTarget;
}

// One briefing section as text: counted header + capped lines + overflow note.
function sectionText(b: Brief): string {
  if (b.total === 0) return "";
  const more = b.total > b.lines.length ? `\n- …외 ${b.total - b.lines.length}건` : "";
  return `[${b.label} ${b.total}건]\n` + b.lines.map((l) => `- ${l.text}`).join("\n") + more;
}

export function TodayPane() {
  const { connected, openPane, setView } = useWorkspace();
  const cal = useCachedList<CalEvent>("calendar", connected);
  const mail = useCachedList<Mail>("mail", connected);
  const todo = useCachedList<Todo>("todo", connected);
  const work = useCachedList<WorkItem>("workfeed", connected);

  const events = cal.result?.data ?? [];
  // Recent mail, unread first — robust if `isUnread` is absent (order is just preserved).
  const mails = [...(mail.result?.data ?? [])].sort(
    (a, b) => Number(Boolean(b.isUnread)) - Number(Boolean(a.isUnread)),
  );
  // Open todos, soonest due first; missing/unparseable due dates sink to the bottom.
  const due = (s?: string) => {
    if (!s) return Infinity;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? Infinity : t;
  };
  const todos = (todo.result?.data ?? []).filter((t) => !t.done).sort((a, b) => due(a.due) - due(b.due));
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
        return {
          text: `${ev.summary ?? ev.title ?? "(제목 없음)"}${span ? ` · ${span}` : ""}`,
          target: { view: "calendar", id: ev.id, dayKey: eventDayKeys(ev.start, ev.end)[0] },
        };
      }),
    },
    {
      label: "메일",
      view: "mail",
      empty: "메일 없음",
      query: mail.query,
      total: mails.length,
      lines: mails.slice(0, MAX).map((m) => {
        const who = text(m.from);
        return {
          text: `${m.isUnread ? "● " : ""}${m.subject ?? "(제목 없음)"}${who ? ` · ${who}` : ""}`,
          target: { view: "mail", id: m.id },
        };
      }),
    },
    {
      label: "할일",
      view: "todo",
      empty: "할일 없음",
      query: todo.query,
      total: todos.length,
      lines: todos.slice(0, MAX).map((t) => ({
        text: `${t.title}${t.due ? ` · 마감 ${fmtDate(t.due)}` : ""}`,
        target: { view: "todo", id: t.id },
      })),
    },
    {
      label: "작업피드",
      view: "workfeed",
      empty: "작업피드 비어 있음",
      query: work.query,
      total: items.length,
      lines: items.slice(0, MAX).map((w) => ({
        text: `${w.title ?? "(항목)"}${w.source ? ` · ${w.source}` : ""}`,
        target: { view: "workfeed", id: w.id },
      })),
    },
  ];

  // The full briefing the AI panel reads — exactly what's on screen, as text.
  const body = briefs.map(sectionText).filter(Boolean).join("\n\n");
  useRegisterPane(undefined, body ? `[오늘 브리핑]\n${body}` : "");

  const today = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "short" });

  return (
    <>
      <h2 style={{ marginTop: 2 }}>
        오늘 <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted-2)", letterSpacing: 0 }}>{today}</span>
      </h2>
      {!connected ? (
        <p style={{ color: "var(--muted-2)", fontSize: 13 }}>미연결</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(232px, 1fr))",
            gap: "20px 28px",
            maxWidth: 760,
          }}
        >
          {briefs.map((b, i) => (
            <Section
              key={b.label}
              brief={b}
              index={i}
              onNav={() => setView(b.view)}
              onOpenLine={(target) => openPane(target.view, target)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Section({
  brief,
  index,
  onNav,
  onOpenLine,
}: {
  brief: Brief;
  index: number;
  onNav: () => void;
  onOpenLine: (target: PaneTarget) => void;
}) {
  const { label, total, lines, empty, query } = brief;
  return (
    <section className="fade-up" style={{ minWidth: 0, animationDelay: `${index * 60}ms` }}>
      <button
        onClick={onNav}
        aria-label={`${label} 열기`}
        title={`${label} 열기`}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: "1px solid var(--line)",
          padding: "0 0 7px",
          margin: "0 0 9px",
          cursor: "pointer",
          color: "var(--ink)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>{label}</span>
        {total > 0 && <span style={{ fontSize: 11, color: "var(--muted-2)" }}>{total}</span>}
        <span style={{ marginLeft: "auto", color: "var(--faint)", display: "inline-flex" }}>
          <Icon name="arrow-right" size={14} />
        </span>
      </button>
      <GridNotice query={query} count={lines.length} empty={empty}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {lines.map((line, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (line.target ? onOpenLine(line.target) : onNav())}
              title={`${label}에서 열기`}
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.5,
                textAlign: "left",
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {line.text}
            </button>
          ))}
          {total > lines.length && (
            <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 2 }}>…외 {total - lines.length}건</div>
          )}
        </div>
      </GridNotice>
    </section>
  );
}

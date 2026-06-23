import { useState } from "react";
import { useCreate, useList, useUpdate } from "@refinedev/core";
import type { CalEvent } from "@/types";
import { serializeList } from "@/aiText";
import { calSpan, calStamp, errText } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn, StopClick } from "@/components/Grid";
import { Detail, Field, Modal } from "@/components/Modal";

// Gateway sends the event name under `summary`; keep `title` as a legacy fallback.
const titleOf = (ev: CalEvent) => ev.summary ?? ev.title ?? "(제목 없음)";

// RFC3339 → <input type="datetime-local"> value (local wall-clock, minute precision).
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<CalEvent>({ resource: "calendar", queryOptions: { enabled: connected } });
  const events = result?.data ?? [];
  const { run, error, busy } = useAction(() => void query.refetch());
  // null = closed · {} = create · { ev } = open existing (editable when ev.local).
  const [edit, setEdit] = useState<{ ev?: CalEvent } | null>(null);

  const aiText = serializeList("일정", events, (ev) => {
    const span = calSpan(ev.start, ev.end);
    return `- ${titleOf(ev)}${span ? ` (${span})` : ""}${ev.location ? ` @${ev.location}` : ""}`;
  });
  useRegisterPane("calendar", aiText);

  const columns: Column<CalEvent>[] = [
    {
      header: "시간",
      width: 230,
      tdStyle: { fontSize: 13, opacity: 0.8, whiteSpace: "nowrap" },
      cell: (ev) => calSpan(ev.start, ev.end) || "—",
    },
    { header: "일정", cell: (ev) => titleOf(ev) },
    { header: "장소", width: 150, tdStyle: { fontSize: 13, opacity: 0.7 }, cell: (ev) => ev.location ?? "" },
    {
      header: "",
      width: 60,
      tdStyle: { textAlign: "right" },
      // Only locally-created events are deletable; Google-sourced events are read-only.
      cell: (ev) =>
        ev.local ? (
          <StopClick>
            <RowBtn onClick={() => run("miniapp.calendar.delete", { id: ev.id })} disabled={busy} danger title="삭제">
              삭제
            </RowBtn>
          </StopClick>
        ) : null,
    },
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>일정</h2>
        <button className="btn" onClick={() => setEdit({})} disabled={!connected} style={{ marginLeft: "auto" }}>
          새 일정
        </button>
      </div>
      {error && <p style={{ color: "var(--due)", fontSize: 12, margin: "0 0 8px" }}>오류: {error}</p>}
      <GridNotice query={query} count={events.length} empty="다가오는 일정이 없습니다.">
        <Grid
          columns={columns}
          rows={events}
          getKey={(ev) => String(ev.id)}
          maxWidth={780}
          onRowClick={(ev) => setEdit({ ev })}
        />
      </GridNotice>
      {edit && <EventModal event={edit.ev} onClose={() => setEdit(null)} onSaved={() => void query.refetch()} />}
    </>
  );
}

// Create (no event), edit (event.local), or read-only detail (Google event) — one
// modal. Write paths use the already-wired calendar.create / calendar.update RPCs.
function EventModal({ event, onClose, onSaved }: { event?: CalEvent; onClose: () => void; onSaved: () => void }) {
  const isNew = !event;
  const editable = isNew || event.local === true;

  const s = calStamp(event?.start);
  const e = calStamp(event?.end);
  const initAllDay = Boolean(event?.allDay || s.allDay);
  const [summary, setSummary] = useState(event?.summary ?? event?.title ?? "");
  const [allDay, setAllDay] = useState(initAllDay);
  // Stored as datetime-local strings; the date input binds to the YYYY-MM-DD slice.
  const [start, setStart] = useState(initAllDay ? (s.iso ? `${s.iso.slice(0, 10)}T00:00` : "") : toLocalInput(s.iso));
  const [end, setEnd] = useState(initAllDay ? (e.iso ? `${e.iso.slice(0, 10)}T00:00` : "") : toLocalInput(e.iso));
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [status, setStatus] = useState("");
  const { mutate: createEvent } = useCreate();
  const { mutate: updateEvent } = useUpdate();

  function save() {
    const sum = summary.trim();
    if (!sum) return setStatus("제목을 입력하세요");
    if (!start) return setStatus("시작 시각을 입력하세요");
    // Field shapes are best-effort vs the live gateway (DESIGN §5) — verify live.
    const payload: Record<string, unknown> = {
      summary: sum,
      allDay,
      start: allDay ? start.slice(0, 10) : new Date(start).toISOString(),
    };
    if (end) payload.end = allDay ? end.slice(0, 10) : new Date(end).toISOString();
    if (location.trim()) payload.location = location.trim();
    if (description.trim()) payload.description = description.trim();
    setStatus("저장 중…");
    const opts = {
      onSuccess: () => {
        onSaved();
        onClose();
      },
      onError: (err: unknown) => setStatus(`오류: ${errText(err)}`),
    };
    if (isNew) createEvent({ resource: "calendar", values: payload }, opts);
    else updateEvent({ resource: "calendar", id: event.id, values: payload }, opts);
  }

  // Read-only detail for Google-sourced events (not editable here).
  if (!editable) {
    return (
      <Modal
        title={titleOf(event)}
        onClose={onClose}
        footer={
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        }
      >
        <Detail label="시간" value={calSpan(event.start, event.end) || "—"} />
        {event.location && <Detail label="장소" value={event.location} />}
        {event.description && <Detail label="설명" value={event.description} multiline />}
        <p style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
          외부(구글) 일정은 여기서 수정할 수 없습니다.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={isNew ? "새 일정" : "일정 수정"}
      onClose={onClose}
      footer={
        <>
          {status && <span style={{ fontSize: 12, color: "var(--muted)", marginRight: "auto" }}>{status}</span>}
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-accent" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <Field label="제목">
        <input className="field" value={summary} onChange={(ev) => setSummary(ev.target.value)} autoFocus />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} />
        종일
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="시작">
          {allDay ? (
            <input
              type="date"
              className="field"
              value={start.slice(0, 10)}
              onChange={(ev) => setStart(`${ev.target.value}T00:00`)}
            />
          ) : (
            <input type="datetime-local" className="field" value={start} onChange={(ev) => setStart(ev.target.value)} />
          )}
        </Field>
        <Field label="종료">
          {allDay ? (
            <input
              type="date"
              className="field"
              value={end.slice(0, 10)}
              onChange={(ev) => setEnd(`${ev.target.value}T00:00`)}
            />
          ) : (
            <input type="datetime-local" className="field" value={end} onChange={(ev) => setEnd(ev.target.value)} />
          )}
        </Field>
      </div>
      <Field label="장소">
        <input className="field" value={location} onChange={(ev) => setLocation(ev.target.value)} />
      </Field>
      <Field label="설명">
        <textarea
          className="field"
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          rows={3}
          style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </Field>
    </Modal>
  );
}

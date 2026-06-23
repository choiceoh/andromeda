import { useList } from "@refinedev/core";
import type { CalEvent } from "@/types";
import { serializeList } from "@/aiText";
import { calSpan } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

// Gateway sends the event name under `summary`; keep `title` as a legacy fallback.
const titleOf = (ev: CalEvent) => ev.summary ?? ev.title ?? "(제목 없음)";

export function CalendarPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<CalEvent>({ resource: "calendar", queryOptions: { enabled: connected } });
  const events = result?.data ?? [];
  const { run, error, busy } = useAction(() => void query.refetch());

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
          <RowBtn onClick={() => run("miniapp.calendar.delete", { id: ev.id })} disabled={busy} danger title="삭제">
            삭제
          </RowBtn>
        ) : null,
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>일정</h2>
      {error && <p style={{ color: "var(--due)", fontSize: 12, margin: "0 0 8px" }}>오류: {error}</p>}
      <GridNotice query={query} count={events.length} empty="다가오는 일정이 없습니다.">
        <Grid columns={columns} rows={events} getKey={(ev) => String(ev.id)} maxWidth={780} />
      </GridNotice>
    </>
  );
}

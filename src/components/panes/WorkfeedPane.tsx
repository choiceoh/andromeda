import { useList } from "@refinedev/core";
import type { WorkItem } from "@/types";
import { serializeList } from "@/aiText";
import { WORKFEED_RPC } from "@/resources";
import { fmtDate } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

export function WorkfeedPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<WorkItem>({ resource: "workfeed", queryOptions: { enabled: connected } });
  const items = result?.data ?? [];
  const { run, error, busy } = useAction(() => void query.refetch());

  const aiText = serializeList(
    "작업피드",
    items,
    (w) => `- ${w.title ?? "(항목)"}${w.source ? ` [${w.source}]` : ""}${w.body ? `\n    ${w.body}` : ""}`,
  );
  useRegisterPane("workfeed", aiText);

  const columns: Column<WorkItem>[] = [
    {
      header: "출처",
      width: 100,
      tdStyle: { fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" },
      cell: (w) => w.source ?? "",
    },
    {
      header: "항목",
      cell: (w) => (
        <>
          <div style={{ fontWeight: 500 }}>{w.title ?? "(항목)"}</div>
          {w.body && <div style={{ fontSize: 12, color: "var(--muted-2)", lineHeight: 1.45 }}>{w.body}</div>}
          {w.actions && w.actions.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
              {w.actions.map((a) => (
                <button
                  key={a.id}
                  className="chip"
                  disabled={busy}
                  onClick={() => run(WORKFEED_RPC.actionRun, { itemId: w.id, actionId: a.id })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </>
      ),
    },
    {
      header: "시각",
      width: 120,
      tdStyle: { fontSize: 13, opacity: 0.7, whiteSpace: "nowrap" },
      cell: (w) => fmtDate(w.createdAtMs),
    },
    {
      header: "",
      width: 60,
      tdStyle: { textAlign: "right" },
      cell: (w) => (
        <RowBtn onClick={() => run(WORKFEED_RPC.ack, { id: w.id })} disabled={busy} title="처리(닫기)">
          처리
        </RowBtn>
      ),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>작업피드</h2>
      {error && <p className="pane-error">오류: {error}</p>}
      <GridNotice query={query} count={items.length} empty="작업피드가 비어 있습니다.">
        <Grid columns={columns} rows={items} getKey={(w) => String(w.id)} />
      </GridNotice>
    </>
  );
}

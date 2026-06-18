import { useList } from "@refinedev/core";
import type { WorkItem } from "@/types";
import { serializeList } from "@/aiText";
import { fmtDate } from "@/format";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice } from "@/components/Grid";

export function WorkfeedPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<WorkItem>({ resource: "workfeed", queryOptions: { enabled: connected } });
  const items = result?.data ?? [];

  const aiText = serializeList(
    "작업피드",
    items,
    (w) => `- ${w.title ?? w.summary ?? "(항목)"}${w.kind ? ` [${w.kind}]` : ""}`,
  );
  useRegisterPane("workfeed", aiText);

  const columns: Column<WorkItem>[] = [
    { header: "종류", width: 90, tdStyle: { fontSize: 13, opacity: 0.7 }, cell: (w) => w.kind ?? "" },
    {
      header: "항목",
      cell: (w) => (
        <>
          <div>{w.title ?? "(항목)"}</div>
          {w.summary && <div style={{ fontSize: 12, opacity: 0.6 }}>{w.summary}</div>}
        </>
      ),
    },
    {
      header: "시각",
      width: 130,
      tdStyle: { fontSize: 13, opacity: 0.7, whiteSpace: "nowrap" },
      cell: (w) => fmtDate(w.ts),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>작업피드</h2>
      <GridNotice query={query} count={items.length} empty="작업피드가 비어 있습니다.">
        <Grid columns={columns} rows={items} getKey={(w) => String(w.id)} />
      </GridNotice>
    </>
  );
}

import { useList } from "@refinedev/core";
import type { Cron } from "@/types";
import { serializeList } from "@/aiText";
import { CRON_RPC } from "@/resources";
import { fmtDate } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

export function CronsPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<Cron>({ resource: "crons", queryOptions: { enabled: connected } });
  const crons = result?.data ?? [];
  const { run, error, busy } = useAction(() => void query.refetch());

  const aiText = serializeList(
    "크론",
    crons,
    (c) => `- ${c.name ?? "(이름 없음)"}${c.schedule ? ` (${c.schedule})` : ""}${c.enabled === false ? " [중지]" : ""}`,
  );
  useRegisterPane("crons", aiText);

  const columns: Column<Cron>[] = [
    { header: "이름", cell: (c) => c.name ?? "—" },
    { header: "주기", width: 160, tdStyle: { fontSize: 13, opacity: 0.75 }, cell: (c) => c.schedule ?? "" },
    {
      header: "다음 실행",
      width: 128,
      tdStyle: { fontSize: 13, opacity: 0.7, whiteSpace: "nowrap" },
      cell: (c) => fmtDate(c.nextRunAtMs),
    },
    { header: "상태", width: 52, cell: (c) => (c.enabled === false ? "중지" : "활성") },
    {
      header: "",
      width: 170,
      tdStyle: { whiteSpace: "nowrap", textAlign: "right" },
      cell: (c) => (
        <span style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
          <RowBtn onClick={() => run(CRON_RPC.run, { id: c.id })} disabled={busy} title="지금 실행">
            실행
          </RowBtn>
          <RowBtn
            onClick={() => run(CRON_RPC.update, { id: c.id, enabled: c.enabled === false })}
            disabled={busy}
            title={c.enabled === false ? "활성화" : "중지"}
          >
            {c.enabled === false ? "활성화" : "중지"}
          </RowBtn>
          <RowBtn onClick={() => run(CRON_RPC.remove, { id: c.id })} disabled={busy} danger title="삭제">
            삭제
          </RowBtn>
        </span>
      ),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>크론</h2>
      {error && <p style={{ color: "var(--due)", fontSize: 12, margin: "0 0 8px" }}>오류: {error}</p>}
      <GridNotice query={query} count={crons.length} empty="크론이 없습니다.">
        <Grid columns={columns} rows={crons} getKey={(c) => String(c.id)} maxWidth={840} />
      </GridNotice>
    </>
  );
}

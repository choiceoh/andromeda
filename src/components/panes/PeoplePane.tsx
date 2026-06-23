import { useList } from "@refinedev/core";
import type { Person } from "@/types";
import { serializeList } from "@/aiText";
import { fmtDate } from "@/format";
import { ellipsis } from "@/theme";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice } from "@/components/Grid";

// people.list merges recent Gmail counterparties (ranked by volume) with 인물 wiki
// pages — so a row may have a messageCount, a wikiSummary, or both.
export function PeoplePane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<Person>({ resource: "people", queryOptions: { enabled: connected } });
  const people = result?.data ?? [];

  const aiText = serializeList(
    "연락처",
    people,
    (p) =>
      `- ${p.name ?? p.email}${p.email && p.name ? ` <${p.email}>` : ""}` +
      `${p.wikiSummary ? ` · ${p.wikiSummary}` : ""}` +
      `${p.lastSubject ? ` · 최근: ${p.lastSubject}` : ""}`,
    "명",
  );
  useRegisterPane("people", aiText);

  const columns: Column<Person>[] = [
    { header: "이름", width: 120, cell: (p) => p.name ?? "—" },
    {
      header: "이메일",
      width: 210,
      tdStyle: { fontSize: 13, opacity: 0.75, ...ellipsis(210) },
      cell: (p) => p.email ?? "",
    },
    {
      header: "메일",
      width: 56,
      tdStyle: { fontSize: 13, opacity: 0.7, textAlign: "right", whiteSpace: "nowrap" },
      cell: (p) => (p.messageCount ? String(p.messageCount) : ""),
    },
    {
      header: "최근 제목 / 메모",
      tdStyle: { fontSize: 13, opacity: 0.7 },
      cell: (p) => p.lastSubject ?? p.wikiSummary ?? "",
    },
    {
      header: "최근",
      width: 116,
      tdStyle: { fontSize: 13, opacity: 0.6, whiteSpace: "nowrap" },
      cell: (p) => fmtDate(p.lastSeen),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>연락처</h2>
      <GridNotice query={query} count={people.length} empty="연락처가 없습니다.">
        <Grid columns={columns} rows={people} getKey={(p) => p.email || String(p.id ?? "")} maxWidth={820} />
      </GridNotice>
    </>
  );
}

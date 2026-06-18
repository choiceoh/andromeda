import { useList } from "@refinedev/core";
import type { Person } from "../../types";
import { text } from "../../format";
import { useRegisterPane, useWorkspace } from "../../workspaceContext";
import { Column, Grid, GridNotice } from "../Grid";

export function PeoplePane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<Person>({ resource: "people", queryOptions: { enabled: connected } });
  const people = result?.data ?? [];

  const aiText = people.length
    ? `[연락처 ${people.length}명]\n` +
      people.map((p) => `- ${p.name ?? text(p.email) ?? "(이름 없음)"}${p.org ? ` · ${p.org}` : ""}`).join("\n")
    : "";
  useRegisterPane("people", aiText);

  const columns: Column<Person>[] = [
    { header: "이름", cell: (p) => p.name ?? "—" },
    { header: "이메일", width: 240, tdStyle: { fontSize: 13, opacity: 0.75 }, cell: (p) => p.email ?? "" },
    { header: "소속", width: 200, tdStyle: { fontSize: 13, opacity: 0.7 }, cell: (p) => p.org ?? p.role ?? "" },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>연락처</h2>
      <GridNotice query={query} count={people.length} empty="연락처가 없습니다.">
        <Grid columns={columns} rows={people} getKey={(p) => String(p.id)} maxWidth={760} />
      </GridNotice>
    </>
  );
}

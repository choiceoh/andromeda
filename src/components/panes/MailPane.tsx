import { useList } from "@refinedev/core";
import type { Mail } from "@/types";
import { serializeList } from "@/aiText";
import { MAIL_RPC } from "@/resources";
import { color, ellipsis } from "@/theme";
import { fmtDate, text } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

export function MailPane() {
  const { connected } = useWorkspace();
  const { result, query } = useList<Mail>({ resource: "mail", queryOptions: { enabled: connected } });
  const mails = result?.data ?? [];
  const { run, error, busy } = useAction(() => void query.refetch());

  // Mirror the grid (subject · sender · date + snippet) so the AI sees what the user sees.
  const aiText = serializeList("메일", mails, (m) => {
    const who = text(m.from);
    const head = `- ${m.isUnread ? "● " : ""}${m.subject ?? "(제목 없음)"}${who ? ` · ${who}` : ""}${
      m.date ? ` · ${fmtDate(m.date)}` : ""
    }`;
    return m.snippet ? `${head}\n    ${m.snippet}` : head;
  });
  useRegisterPane("mail", aiText);

  const columns: Column<Mail>[] = [
    {
      header: "보낸이",
      width: 170,
      tdStyle: { fontSize: 13, opacity: 0.85, ...ellipsis(170) },
      cell: (m) => {
        const who = text(m.from);
        return (
          <>
            {m.isUnread && <span style={{ color: color.accent, marginRight: 5 }}>●</span>}
            {who || "—"}
          </>
        );
      },
    },
    {
      header: "제목",
      cell: (m) => (
        <>
          <div>{m.subject ?? "(제목 없음)"}</div>
          {m.snippet && <div style={{ fontSize: 12, color: "var(--muted-2)", ...ellipsis(520) }}>{m.snippet}</div>}
        </>
      ),
    },
    {
      header: "날짜",
      width: 116,
      tdStyle: { fontSize: 13, opacity: 0.7, whiteSpace: "nowrap" },
      cell: (m) => fmtDate(m.date),
    },
    {
      header: "",
      width: 150,
      tdStyle: { whiteSpace: "nowrap", textAlign: "right" },
      cell: (m) => (
        <span style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
          {m.isUnread && (
            <RowBtn onClick={() => run(MAIL_RPC.markRead, { id: m.id })} disabled={busy} title="읽음 표시">
              읽음
            </RowBtn>
          )}
          <RowBtn onClick={() => run(MAIL_RPC.archive, { id: m.id })} disabled={busy} title="보관">
            보관
          </RowBtn>
          <RowBtn onClick={() => run(MAIL_RPC.trash, { id: m.id })} disabled={busy} danger title="삭제">
            삭제
          </RowBtn>
        </span>
      ),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>메일</h2>
      {error && <p style={{ color: "var(--due)", fontSize: 12, margin: "0 0 8px" }}>오류: {error}</p>}
      <GridNotice query={query} count={mails.length} empty="메일이 없습니다.">
        <Grid
          columns={columns}
          rows={mails}
          getKey={(m) => String(m.id)}
          rowStyle={(m) => ({ fontWeight: m.isUnread ? 600 : 400 })}
        />
      </GridNotice>
    </>
  );
}

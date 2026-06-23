import { useEffect, useState } from "react";
import type { Mail } from "@/types";
import { serializeList } from "@/aiText";
import { useCachedList, useCachedOne } from "@/cachedList";
import { MAIL_RPC } from "@/resources";
import { color, ellipsis } from "@/theme";
import { fmtDate, text } from "@/format";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";
import { MailDetail, mailBody } from "./MailDetail";

export function MailPane() {
  const { connected, consumePaneTarget, paneTarget } = useWorkspace();
  const { result, query } = useCachedList<Mail>("mail", connected);
  const mails = result?.data ?? [];
  const [selectedId, setSelectedId] = useState<string | number | undefined>();
  const selectedPreview = mails.find((m) => String(m.id) === String(selectedId));
  const detail = useCachedOne<Mail>("mail", selectedId, connected && selectedId !== undefined);
  const selectedMail = detail.result ?? selectedPreview;
  const { run, error, busy } = useAction(() => void query.refetch());

  useEffect(() => {
    if (paneTarget?.view !== "mail" || paneTarget.id === undefined) return;
    setSelectedId(paneTarget.id);
    consumePaneTarget();
  }, [consumePaneTarget, paneTarget]);

  // Mirror the grid (subject · sender · date + snippet) so the AI sees what the user sees.
  const listText = serializeList("메일", mails, (m) => {
    const who = text(m.from);
    const head = `- ${m.isUnread ? "● " : ""}${m.subject ?? "(제목 없음)"}${who ? ` · ${who}` : ""}${
      m.date ? ` · ${fmtDate(m.date)}` : ""
    }`;
    return m.snippet ? `${head}\n    ${m.snippet}` : head;
  });
  const detailBody = mailBody(selectedMail);
  const detailText = selectedMail
    ? `[선택한 메일]\n제목: ${selectedMail.subject ?? "(제목 없음)"}\n보낸이: ${text(selectedMail.from) || "—"}${
        selectedMail.date ? `\n날짜: ${fmtDate(selectedMail.date)}` : ""
      }\n\n${detailBody}`
    : "";
  const aiText = [listText, detailText].filter(Boolean).join("\n\n");
  useRegisterPane("mail", aiText);

  // Detail actions. Archive/trash drop the now-gone selection so the row collapses.
  const act = (method: string) => {
    if (selectedId !== undefined) void run(method, { id: selectedId });
  };
  const closeAfter = (method: string) => {
    if (selectedId === undefined) return;
    void run(method, { id: selectedId });
    setSelectedId(undefined);
  };

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
      width: 58,
      tdStyle: { whiteSpace: "nowrap", textAlign: "right" },
      cell: (m) => (
        <span style={{ display: "inline-flex", gap: 2, justifyContent: "flex-end" }}>
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
      {error && <p className="pane-error">오류: {error}</p>}
      <GridNotice query={query} count={mails.length} empty="메일이 없습니다.">
        <Grid
          columns={columns}
          rows={mails}
          getKey={(m) => String(m.id)}
          rowStyle={(m) => ({ fontWeight: m.isUnread ? 600 : 400 })}
          onRowClick={(m) => setSelectedId((current) => (String(current) === String(m.id) ? undefined : m.id))}
          isRowSelected={(m) => String(m.id) === String(selectedId)}
          rowTitle={(m) => `${m.subject ?? "(제목 없음)"} 읽기`}
          renderExpandedRow={() => (
            <MailDetail
              mail={selectedMail}
              query={detail.query}
              busy={busy}
              onMarkRead={() => act(MAIL_RPC.markRead)}
              onArchive={() => closeAfter(MAIL_RPC.archive)}
              onTrash={() => closeAfter(MAIL_RPC.trash)}
            />
          )}
        />
      </GridNotice>
    </>
  );
}

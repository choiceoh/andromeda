import { useState } from "react";
import type { WorkItem } from "@/types";
import { serializeList } from "@/aiText";
import { useCachedList } from "@/cachedList";
import { chatStream } from "@/gateway";
import { WORKFEED_RPC } from "@/resources";
import { fmtDate } from "@/format";
import { usePaneTarget } from "@/usePaneTarget";
import { useAction } from "@/useAction";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

// Items sourced from a question expect a free-text reply. The gateway settles the
// card via workfeed.answer/action.run, then returns a sessionKey+prompt to deliver.
const isQuestion = (w: WorkItem) => (w.source ?? "").includes("question");

type RunFn = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

interface WorkfeedTurn {
  sessionKey?: string;
  prompt?: string;
}

export function WorkfeedPane() {
  const { connected, cfg } = useWorkspace();
  const { result, query } = useCachedList<WorkItem>("workfeed", connected);
  const items = result?.data ?? [];
  const [selectedId, setSelectedId] = useState<string | number | undefined>();
  const { run, error, busy } = useAction(() => void query.refetch(), {
    onResult: async (data) => {
      const turn = data as WorkfeedTurn;
      const sessionKey = typeof turn?.sessionKey === "string" ? turn.sessionKey.trim() : "";
      const prompt = typeof turn?.prompt === "string" ? turn.prompt.trim() : "";
      if (!sessionKey || !prompt) return;
      let streamError = "";
      await chatStream(
        cfg,
        prompt,
        {
          onError: (err) => {
            streamError = err;
          },
        },
        { sessionKey },
      );
      if (streamError) throw new Error(streamError);
    },
  });

  usePaneTarget("workfeed", setSelectedId);

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
          <WorkItemActions w={w} busy={busy} run={run} />
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
        <RowBtn onClick={() => void run(WORKFEED_RPC.ack, { id: w.id })} disabled={busy} title="처리(닫기)">
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
        <Grid
          columns={columns}
          rows={items}
          getKey={(w) => String(w.id)}
          isRowSelected={(w) => String(w.id) === String(selectedId)}
        />
      </GridNotice>
    </>
  );
}

// Per-item actions mirror the gateway: fixed chips go through action.run, and
// question cards expose a free-text answer box via workfeed.answer.
function WorkItemActions({ w, busy, run }: { w: WorkItem; busy: boolean; run: RunFn }) {
  const question = isQuestion(w);
  const [text, setText] = useState("");
  const hasActions = (w.actions?.length ?? 0) > 0;

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void run(WORKFEED_RPC.answer, { itemId: w.id, answer: t });
  };

  if (!hasActions && !question) return null;

  return (
    <>
      {hasActions && (
        <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {w.actions?.map((a) => (
            <button
              key={a.id}
              className="chip"
              disabled={busy}
              onClick={() => void run(WORKFEED_RPC.actionRun, { itemId: w.id, actionId: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {question && (
        <div style={{ display: "flex", gap: 5, marginTop: 6, maxWidth: 460 }}>
          <input
            className="field"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
            placeholder="답변 입력…"
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button className="chip" onClick={submit} disabled={busy || !text.trim()}>
            답변
          </button>
        </div>
      )}
    </>
  );
}

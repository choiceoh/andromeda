import { useState } from "react";
import { useCreate, useDelete, useList, useUpdate } from "@refinedev/core";
import type { Todo } from "@/types";
import { serializeList } from "@/aiText";
import { fmtDate } from "@/format";
import { field } from "@/theme";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Column, Grid, GridNotice, RowBtn } from "@/components/Grid";

export function TodoPane() {
  const { connected } = useWorkspace();
  const [newTodo, setNewTodo] = useState("");
  const { result, query } = useList<Todo>({ resource: "todo", queryOptions: { enabled: connected } });
  const todos = result?.data ?? [];
  const { mutate: createTodo } = useCreate();
  const { mutate: updateTodo } = useUpdate();
  const { mutate: deleteTodo } = useDelete();

  // Serialize the grid to text so Deneb's AI reads exactly what's on screen.
  const aiText = serializeList(
    "할일",
    todos,
    (t) => `- [${t.done ? "x" : " "}] ${t.title}${t.due ? ` (마감 ${fmtDate(t.due)})` : ""}`,
  );
  useRegisterPane("todo", aiText);

  function addTodo() {
    const title = newTodo.trim();
    if (!title) return;
    setNewTodo("");
    createTodo({ resource: "todo", values: { title } }, { onSuccess: () => void query.refetch() });
  }
  function toggleTodo(t: Todo) {
    updateTodo({ resource: "todo", id: t.id, values: { done: !t.done } }, { onSuccess: () => void query.refetch() });
  }
  function removeTodo(t: Todo) {
    deleteTodo({ resource: "todo", id: t.id }, { onSuccess: () => void query.refetch() });
  }

  const columns: Column<Todo>[] = [
    {
      header: "완료",
      width: 40,
      cell: (t) => <input type="checkbox" checked={Boolean(t.done)} onChange={() => toggleTodo(t)} />,
    },
    {
      header: "제목",
      cell: (t) => (
        <span style={{ textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.5 : 1 }}>{t.title}</span>
      ),
    },
    { header: "마감", width: 116, cell: (t) => fmtDate(t.due), tdStyle: { fontSize: 13, opacity: 0.7 } },
    {
      header: "",
      width: 56,
      tdStyle: { textAlign: "right" },
      cell: (t) => (
        <RowBtn onClick={() => removeTodo(t)} danger title="삭제">
          삭제
        </RowBtn>
      ),
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: 2 }}>할일</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, maxWidth: 540 }}>
        <input
          style={{ ...field, flex: 1 }}
          placeholder="새 할일…"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTodo();
          }}
        />
        <button onClick={addTodo} style={{ padding: "8px 14px" }}>
          추가
        </button>
      </div>
      <GridNotice query={query} count={todos.length} empty="할일이 없습니다.">
        <Grid columns={columns} rows={todos} getKey={(t) => String(t.id)} maxWidth={680} />
      </GridNotice>
    </>
  );
}

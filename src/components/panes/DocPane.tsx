import { useState } from "react";
import { font } from "@/theme";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Markdown } from "@/components/Markdown";

// Client-only scratch document. Its text lives in the workspace context so it
// survives pane switches, and it has no backing resource (AI reads it but there's
// nothing to invalidate after a tool call). Markdown preview toggle renders the
// scratch as formatted text.
export function DocPane() {
  const { doc, setDoc } = useWorkspace();
  const [preview, setPreview] = useState(false);
  useRegisterPane(undefined, doc.trim() ? `[문서]\n${doc}` : "");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>문서</h2>
        <button
          className="btn"
          onClick={() => setPreview((p) => !p)}
          disabled={!doc.trim()}
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          {preview ? "편집" : "미리보기"}
        </button>
      </div>
      {preview ? (
        <div className="md-surface" style={{ height: "70vh", overflow: "auto" }} aria-label="문서 미리보기">
          <Markdown text={doc} />
        </div>
      ) : (
        <textarea
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          placeholder="여기에 문서를 작성하세요. 우측 AI가 이 내용을 텍스트로 읽습니다."
          className="field"
          style={{
            width: "100%",
            height: "70vh",
            boxSizing: "border-box",
            resize: "none",
            fontFamily: font,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        />
      )}
    </>
  );
}

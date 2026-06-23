import { useEffect, useState } from "react";
import { callRpc } from "@/gateway";
import { MEMORY_RPC } from "@/resources";
import type { WikiPage } from "@/types";
import { errText } from "@/format";
import { color, font, line, muted } from "@/theme";
import { useRegisterPane, useWorkspace } from "@/workspaceContext";
import { Field, Modal } from "@/components/Modal";
import { Markdown } from "@/components/Markdown";

interface Category {
  name: string;
  pageCount?: number;
}

// Wiki editor over memory.* — browse pages by category, search, open one into the
// editor, save back, and create new pages. Query-driven (memory.*), so it calls
// RPCs directly. Opens on a category browse list (no search needed) so the wiki is
// usable immediately; search and the openWiki deeplink layer on top.
export function WikiPane() {
  const { connected, cfg, wikiTarget, consumeWikiTarget } = useWorkspace();
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<WikiPage[]>([]); // search results
  const [searched, setSearched] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [browseCat, setBrowseCat] = useState<string | null>(null);
  const [catPages, setCatPages] = useState<WikiPage[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);

  useRegisterPane(undefined, content.trim() ? `[위키${path ? ` ${path}` : ""}]\n${content}` : "");

  const keyOf = (p: WikiPage) => p.path ?? String(p.id ?? "");

  // Load the category list once connected — the default browse view, so the wiki
  // shows its pages immediately instead of an empty "search first" panel.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void callRpc<{ categories?: Category[] }>(cfg, MEMORY_RPC.categories, {})
      .then((r) => {
        if (!cancelled) setCategories(r?.categories ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, cfg.url, cfg.token]);

  async function search() {
    if (!connected) return;
    const query = q.trim();
    // The gateway rejects an empty query ("query is required") — don't fire a
    // doomed RPC; just fall back to the browse list.
    if (!query) {
      setSearched(false);
      setPages([]);
      setStatus("");
      return;
    }
    setStatus("검색 중…");
    try {
      // Gateway memory.search wraps hits as { results: [...] } (memory.go);
      // tolerate a bare array / legacy { pages } too so we never silently drop rows.
      const res = await callRpc<WikiPage[] | { results?: WikiPage[]; pages?: WikiPage[] }>(cfg, MEMORY_RPC.search, {
        query,
      });
      const list = Array.isArray(res) ? res : (res?.results ?? res?.pages ?? []);
      setPages(list);
      setSearched(true);
      setStatus(list.length ? "" : "검색 결과 없음");
    } catch (e) {
      setStatus(`오류: ${errText(e)}`);
    }
  }

  function clearSearch() {
    setSearched(false);
    setPages([]);
    setQ("");
    setStatus("");
  }

  async function openCategory(name: string) {
    setBrowseCat(name);
    setStatus("불러오는 중…");
    try {
      const res = await callRpc<{ pages?: WikiPage[] }>(cfg, MEMORY_RPC.listInCategory, { category: name, limit: 200 });
      setCatPages(res?.pages ?? []);
      setStatus("");
    } catch (e) {
      setStatus(`오류: ${errText(e)}`);
    }
  }

  async function openPath(key: string) {
    if (!key) return;
    setStatus("불러오는 중…");
    try {
      // get_page returns the page body under `body` (memory.go out struct),
      // not `content`. Keep string/`content` fallbacks for robustness.
      const page = await callRpc<{ body?: string; content?: string } | string>(cfg, MEMORY_RPC.getPage, { path: key });
      setPath(key);
      setContent(typeof page === "string" ? page : (page?.body ?? page?.content ?? ""));
      setStatus("");
    } catch (e) {
      setStatus(`오류: ${errText(e)}`);
    }
  }

  // 인물 카드 / 검색 결과에서 넘어온 위키 경로를 열고 채널을 비운다.
  useEffect(() => {
    if (!connected || !wikiTarget) return;
    void openPath(wikiTarget);
    consumeWikiTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiTarget, connected]);

  async function save() {
    if (!path) return;
    setStatus("저장 중…");
    try {
      // write_page reads the body from `body` (memory_write.go). Sending it as
      // `content` left body empty server-side and CLOBBERED the page to blank.
      await callRpc(cfg, MEMORY_RPC.writePage, { path, body: content });
      setStatus("저장됨");
    } catch (e) {
      setStatus(`오류: ${errText(e)}`);
    }
  }

  async function createNewPage(newPath: string) {
    const p = newPath.trim();
    if (!p) return;
    setStatus("생성 중…");
    try {
      await callRpc(cfg, MEMORY_RPC.createPage, { path: p });
      setCreating(false);
      await openPath(p);
    } catch (e) {
      setStatus(`오류: ${errText(e)}`);
    }
  }

  // A single clickable page row, reused by search results and category listings.
  const renderPage = (p: WikiPage) => (
    <button
      key={keyOf(p) || (p.title ?? "")}
      onClick={() => void openPath(keyOf(p))}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: keyOf(p) === path ? color.active : "transparent",
        color: color.text,
        border: "none",
        borderRadius: 4,
        padding: "6px 8px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {p.title ?? p.path ?? "(제목 없음)"}
    </button>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, height: "100%" }}>
      <div style={{ borderRight: line, paddingRight: 12, overflow: "auto" }}>
        <input
          className="field"
          style={{ width: "100%", boxSizing: "border-box", fontSize: 12, marginBottom: 8 }}
          placeholder="위키 검색…"
          value={q}
          disabled={!connected}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <button
          className="btn"
          onClick={() => setCreating(true)}
          disabled={!connected}
          style={{ width: "100%", marginBottom: 10, fontSize: 12, padding: "6px 0" }}
        >
          + 새 페이지
        </button>
        {!connected ? (
          <p style={muted}>게이트웨이에 연결하세요.</p>
        ) : searched ? (
          <>
            <button className="row-btn" onClick={clearSearch} style={{ marginBottom: 6, padding: "3px 6px" }}>
              ← 목록으로
            </button>
            {pages.length === 0 ? <p style={muted}>검색 결과 없음</p> : pages.map(renderPage)}
          </>
        ) : browseCat ? (
          <>
            <button
              className="row-btn"
              onClick={() => setBrowseCat(null)}
              style={{ marginBottom: 4, padding: "3px 6px" }}
            >
              ← 카테고리
            </button>
            <div className="micro" style={{ margin: "0 0 6px 2px" }}>
              {browseCat}
            </div>
            {catPages.length === 0 ? <p style={muted}>페이지가 없습니다.</p> : catPages.map(renderPage)}
          </>
        ) : categories.length === 0 ? (
          <p style={muted}>위키 페이지가 없습니다.</p>
        ) : (
          categories.map((c) => (
            <button
              key={c.name}
              onClick={() => void openCategory(c.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                textAlign: "left",
                background: "transparent",
                color: color.text,
                border: "none",
                borderRadius: 4,
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              {c.pageCount != null && (
                <span style={{ marginLeft: "auto", flex: "0 0 auto", fontSize: 11, color: "var(--muted-2)" }}>
                  {c.pageCount}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{path ?? "위키"}</h3>
          <button
            className="btn"
            onClick={() => setPreview((p) => !p)}
            disabled={!path}
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            {preview ? "편집" : "미리보기"}
          </button>
          <button
            className="btn btn-accent"
            onClick={() => void save()}
            disabled={!path}
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            저장
          </button>
          {status && <span className="pane-status">{status}</span>}
        </div>
        {preview ? (
          <div className="md-surface" style={{ flex: 1, overflow: "auto", minHeight: 0 }} aria-label="위키 미리보기">
            <Markdown text={content} />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!path}
            placeholder={path ? "" : "왼쪽에서 페이지를 선택하면 편집할 수 있습니다."}
            className="field"
            style={{
              flex: 1,
              resize: "none",
              fontFamily: font,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          />
        )}
      </div>
      {creating && <NewPageModal onClose={() => setCreating(false)} onCreate={(p) => void createNewPage(p)} />}
    </div>
  );
}

// Prompt for a new page path (e.g. "projects/andromeda" or "인물/홍길동"), then
// create it via memory.create_page and open it in the editor.
function NewPageModal({ onClose, onCreate }: { onClose: () => void; onCreate: (path: string) => void }) {
  const [path, setPath] = useState("");
  return (
    <Modal
      title="새 위키 페이지"
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn-accent" onClick={() => onCreate(path)} disabled={!path.trim()}>
            생성
          </button>
        </>
      }
    >
      <Field label="경로">
        <input
          className="field"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="예: projects/andromeda"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && path.trim()) onCreate(path);
          }}
        />
      </Field>
      <p style={{ fontSize: 12, color: "var(--muted-2)", margin: 0 }}>
        슬래시로 분류를 나눕니다. 생성 후 바로 편집할 수 있습니다.
      </p>
    </Modal>
  );
}

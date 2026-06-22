import { useEffect, useMemo } from "react";
import type { GatewayConfig } from "@/gateway";
import type { View } from "@/types";
import { useWorkspace } from "@/workspaceContext";
import { AIPanel } from "./AIPanel";
import { Sidebar } from "./Sidebar";
import { PANES } from "./panes";

// The shell: a slim nav rail + two floating panels (work area · Deneb AI) drifting
// on the window's gradient, Zen-browser style. The work area renders only the
// active pane; ⌘/Ctrl+0–9 shortcuts are derived from the pane registry (the labels
// are hidden in the rail, but the keys still work).
export function Workstation({ cfg, setCfg }: { cfg: GatewayConfig; setCfg: (c: GatewayConfig) => void }) {
  const { view, setView } = useWorkspace();

  const shortcuts = useMemo(() => {
    const m: Record<string, View> = {};
    for (const p of PANES) m[p.shortcut] = p.key;
    return m;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const next = shortcuts[e.key];
      if (!next) return;
      e.preventDefault();
      setView(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, setView]);

  const Active = PANES.find((p) => p.key === view)?.Component ?? PANES[0].Component;

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--gap)",
        height: "100vh",
        padding: "var(--gap)",
        boxSizing: "border-box",
      }}
    >
      <Sidebar cfg={cfg} setCfg={setCfg} />
      <main className="panel" style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "20px 22px" }}>
        <Active />
      </main>
      <AIPanel cfg={cfg} />
    </div>
  );
}

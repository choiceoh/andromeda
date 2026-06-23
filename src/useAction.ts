import { useState } from "react";

import { callRpc } from "./gateway";
import { errText } from "./format";
import { useWorkspace } from "./workspaceContext";

// Fire a non-CRUD gateway action RPC (mail archive, cron run, workfeed ack, …),
// then refetch the pane's list. Surfaces a one-line error and a busy flag so panes
// can disable buttons mid-flight. Mirrors the native client's optimistic actions
// (here: simplest correct form — act, then re-read authoritative state).
export function useAction(refetch: () => void) {
  const { cfg } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(method: string, params: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await callRpc(cfg, method, params);
      setError("");
      refetch();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return { run, error, busy };
}

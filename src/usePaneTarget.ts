// Deep-link target hook. When another pane asks to open a specific row here
// (via `openPane(view, { id })`), this runs the `apply` callback with the target
// id and consumes it (clears the pending target) — so the pane doesn't have to
// re-implement the "view matches → act → consume" effect each time.
//
// `apply` is re-run whenever it/its closure changes (so a pane that finds a row
// by id sees the latest list), but is a no-op once `paneTarget` no longer matches
// this view (it's either null or for another pane). `isLoading` (defaults to
// false) gates consumption: panes backed by a query that's still loading pass it
// so the target isn't consumed before the matching row exists.
import { useEffect } from "react";
import { useWorkspace } from "./workspaceContext";
import type { View } from "./types";

export function usePaneTarget(view: View, apply: (id: string | number) => void, isLoading = false): void {
  const { paneTarget, consumePaneTarget } = useWorkspace();
  useEffect(() => {
    if (paneTarget?.view !== view || paneTarget.id === undefined) return;
    apply(paneTarget.id);
    if (!isLoading) consumePaneTarget();
  }, [apply, consumePaneTarget, paneTarget, view, isLoading]);
}

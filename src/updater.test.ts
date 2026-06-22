import { describe, expect, it } from "vitest";

import { checkForUpdates } from "./updater";

// jsdom has no Tauri internals, so checkForUpdates must short-circuit before it
// ever dynamic-imports the desktop-only updater plugin.
describe("updater (web fallback)", () => {
  it("is a no-op off-desktop and never throws", async () => {
    await expect(checkForUpdates()).resolves.toBeUndefined();
  });
});

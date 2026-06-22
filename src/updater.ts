// Desktop auto-update. On launch the app asks the GitHub Releases endpoint
// (configured in src-tauri/tauri.conf.json → plugins.updater) whether a newer
// SIGNED build exists; if so it downloads, installs, and offers to relaunch into
// it. The plugin imports are dynamic so the web bundle never pulls them — same
// guard pattern as tauri.ts. Failures are swallowed: an update hiccup must never
// block startup.
import { isTauri } from "./tauri";
import { errText } from "./format";
import { log } from "./log";

const u = log.child("updater");

// Check for a newer release and, if the user agrees, install + relaunch into it.
// No-op off-desktop (web build) or when already current. Never throws.
export async function checkForUpdates(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      u.debug("already up to date");
      return;
    }
    u.info("update available", update.version, "←", update.currentVersion);

    let downloaded = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        u.debug("downloading", downloaded);
      } else if (event.event === "Finished") {
        u.info("download finished, installing");
      }
    });

    // Don't yank the app out from under the user mid-task — ask first.
    const relaunchNow =
      typeof window === "undefined" || window.confirm(`새 버전 ${update.version} 설치 완료. 지금 재시작할까요?`);
    if (relaunchNow) {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    }
  } catch (e) {
    u.warn("update check failed", errText(e));
  }
}

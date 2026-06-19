// Desktop shell integration. On the desktop (Wails) the client token lives in the
// OS keychain via the TokenService Go bindings (tokens.go); on the web it falls
// back to localStorage. Migrated from Tauri's `invoke` to Wails service bindings —
// the public API is unchanged so callers (App.tsx, gateway.ts) don't change.
//
// The bindings are imported DYNAMICALLY inside the isTauri() guards so the web
// bundle and tests never load @wailsio/runtime (it opens an IPC connection on
// import). `isTauri` keeps its name to avoid churn; it now detects the Wails
// webview — rename to `isDesktop` in a follow-up cleanup.
import type * as TokenSvc from "@/bindings/andromeda/tokenservice";

const TOKEN_KEY = "andromeda.token";
const DEFAULT_ACCOUNT = "client:main";

// True inside the Wails desktop webview (its runtime injects `window._wails`).
export function isTauri(): boolean {
  return typeof window !== "undefined" && "_wails" in window;
}

// Lazily load the TokenService bindings — only reached inside the desktop webview.
function tokenService(): Promise<typeof TokenSvc> {
  return import("@/bindings/andromeda/tokenservice");
}

export async function secureGetToken(account: string = DEFAULT_ACCOUNT): Promise<string | null> {
  if (isTauri()) {
    const { Get } = await tokenService();
    return (await Get(account)) || null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function secureSetToken(token: string, account: string = DEFAULT_ACCOUNT): Promise<void> {
  if (isTauri()) {
    const { Set } = await tokenService();
    await Set(account, token);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

// Desktop auto-connect: resolve the client token without manual entry — first the
// OS keychain, then the canonical ~/.deneb/client_token file the gateway writes.
// Returns null off-desktop or when no token is found.
export async function readDesktopToken(): Promise<string | null> {
  if (!isTauri()) return null;
  const { Get, FromFile } = await tokenService();
  const fromKeychain = await Get(DEFAULT_ACCOUNT).catch(() => "");
  if (fromKeychain) return fromKeychain;
  return (await FromFile().catch(() => "")) || null;
}

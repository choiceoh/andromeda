// Reusable stateful hooks: the AI chat stream machine, gateway health check, and
// the proactive events subscription.
import { useEffect, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { type GatewayConfig, chatStream, ping } from "./gateway";
import { type ProactiveEvent, subscribeEvents } from "./events";

export interface ChatState {
  out: string;
  thinking: string;
  busy: boolean;
  turns: ChatTurn[];
  clear: () => void;
  send: (message: string, workspaceContext: string, activeResource?: string) => Promise<void>;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "done" | "streaming" | "error";
}

function chatTurnId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

// Drives one Deneb chat/stream turn: streams delta/tool/thinking, and on done
// invalidates the active resource so AI-driven data changes show in the grid.
export function useChat(cfg: GatewayConfig): ChatState {
  const [out, setOut] = useState("");
  const [thinking, setThinking] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const invalidate = useInvalidate();

  function clear() {
    if (busy) return;
    setOut("");
    setThinking("");
    setTurns([]);
  }

  async function send(message: string, workspaceContext: string, activeResource?: string) {
    const msg = message.trim();
    if (!msg || busy) return;
    const assistantId = chatTurnId();
    setOut("");
    setThinking("");
    setTurns((prev) => [
      ...prev,
      { id: chatTurnId(), role: "user", text: msg, status: "done" },
      { id: assistantId, role: "assistant", text: "", status: "streaming" },
    ]);
    setBusy(true);
    let failed = false;
    const patchAssistant = (update: (turn: ChatTurn) => ChatTurn) => {
      setTurns((prev) => prev.map((turn) => (turn.id === assistantId ? update(turn) : turn)));
    };
    const appendAssistant = (text: string) => {
      patchAssistant((turn) => ({ ...turn, text: turn.text + text }));
    };
    try {
      await chatStream(
        cfg,
        msg,
        {
          onThinking: (preview) => setThinking(preview.slice(0, 90)),
          onDelta: (t) => {
            setThinking("");
            setOut((p) => p + t);
            appendAssistant(t);
          },
          // Show the AI using tools — the visible half of two-way collaboration.
          onTool: (ev) => {
            const e = ev as { state?: string; tool?: string };
            if (e.state === "started" && e.tool) {
              const line = `\n[도구: ${e.tool}]\n`;
              setOut((p) => `${p}${line}`);
              appendAssistant(line);
            }
          },
          // The AI may have changed back-end data via a tool — refresh the active grid.
          onDone: (final) => {
            patchAssistant((turn) => ({ ...turn, text: turn.text || final.text, status: "done" }));
            setOut((p) => p || final.text);
            if (activeResource) invalidate({ resource: activeResource, invalidates: ["list"] });
          },
          onError: (e) => {
            failed = true;
            const line = `\n[오류] ${e}`;
            setOut((p) => `${p}${line}`);
            patchAssistant((turn) => ({ ...turn, text: `${turn.text}${line}`, status: "error" }));
          },
        },
        "client:main",
        workspaceContext,
      );
    } catch (e) {
      failed = true;
      const line = `[오류] ${(e as Error).message}`;
      setOut(line);
      patchAssistant((turn) => ({ ...turn, text: line, status: "error" }));
    } finally {
      setThinking("");
      if (!failed) patchAssistant((turn) => ({ ...turn, status: "done" }));
      setBusy(false);
    }
  }

  return { out, thinking, busy, turns, clear, send };
}

export interface GatewayStatus {
  status: string;
  check: () => Promise<void>;
}

// Live connection status line via miniapp.ping (version/model).
export function useGatewayStatus(cfg: GatewayConfig, initial = "미연결"): GatewayStatus {
  const [status, setStatus] = useState(initial);
  async function check() {
    setStatus("확인 중…");
    try {
      const r = await ping(cfg);
      setStatus(r.ok ? `연결됨 · v${r.version ?? "?"}` : "ping 실패");
    } catch (e) {
      setStatus(`오류: ${(e as Error).message}`);
    }
  }
  return { status, check };
}

export interface EventsState {
  events: ProactiveEvent[];
  status: string;
  dismiss: (id: string) => void;
}

// Subscribes to the proactive event stream while connected, keeping the most
// recent events. Aborts cleanly on unmount or config change.
export function useEvents(cfg: GatewayConfig, connected: boolean): EventsState {
  const [events, setEvents] = useState<ProactiveEvent[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!connected) {
      setStatus("");
      return;
    }
    const controller = new AbortController();
    setStatus("연결 중…");
    subscribeEvents(
      cfg,
      {
        onOpen: () => setStatus("수신 중"),
        onEvent: (ev) => setEvents((prev) => [ev, ...prev].slice(0, 50)),
        onError: (e) => setStatus(`오류: ${e}`),
      },
      controller.signal,
    ).catch((e) => {
      if (!controller.signal.aborted) setStatus(`오류: ${(e as Error).message}`);
    });
    return () => controller.abort();
    // Re-subscribe only when the connection identity changes, not on every cfg ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.url, cfg.token, connected]);

  const dismiss = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));
  return { events, status, dismiss };
}

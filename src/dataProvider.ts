import type { DataProvider } from "@refinedev/core";
import { type GatewayConfig, callRpc } from "./gateway";

// Each Refine resource maps to its Deneb miniapp.* RPC methods. Because the back
// end is already well-structured, it plugs straight into Refine's data-provider
// contract — resources flow into grids/forms with no per-screen glue.
//
// Phase 1: todo (simplest CRUD). Next: mail (gmail.*), calendar (calendar.*),
// memory/wiki (memory.*).
interface ResourceMap {
  list: string;
  create?: string;
  update?: string;
  remove?: string;
}

const RESOURCES: Record<string, ResourceMap> = {
  todo: {
    list: "miniapp.todo.list",
    create: "miniapp.todo.create",
    update: "miniapp.todo.update",
    remove: "miniapp.todo.delete",
  },
};

function mapFor(resource: string): ResourceMap {
  const m = RESOURCES[resource];
  if (!m) throw new Error(`andromeda: unknown resource "${resource}"`);
  return m;
}

// RPC list responses vary in shape: some return a bare array, most wrap it
//   todo.list         -> { todos: [...] }
//   gmail.list_recent -> { messages: [...], nextPageToken }
//   calendar.list_*   -> [ ... ]
// Pull the array out regardless. (Found via runtime check — typecheck can't see
// the wire shape, so this is exactly what the live gateway run caught.)
function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const k of ["todos", "items", "data", "messages", "events", "rows", "results"]) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (firstArray) return firstArray as Record<string, unknown>[];
  }
  return [];
}

// Deneb-backed Refine data provider. RPC payloads are dynamic, so the provider
// works in `any` at this boundary and Refine re-applies the caller's TData on the
// way out (its CRUD methods are generic over caller-supplied TData).
export function denebDataProvider(cfg: GatewayConfig): DataProvider {
  return {
    getApiUrl: () => cfg.url,

    getList: async ({ resource }) => {
      const payload = await callRpc<unknown>(cfg, mapFor(resource).list, {});
      const data = extractRows(payload);
      return { data: data as never[], total: data.length };
    },

    getOne: async ({ resource, id }) => {
      // todo has no dedicated "get" — read the list and find. mail/calendar add getOne later.
      const payload = await callRpc<unknown>(cfg, mapFor(resource).list, {});
      const found = extractRows(payload).find((r) => String(r.id) === String(id));
      return { data: (found ?? { id }) as never };
    },

    create: async ({ resource, variables }) => {
      const m = mapFor(resource);
      if (!m.create) throw new Error(`${resource}: create unsupported`);
      const data = await callRpc<any>(cfg, m.create, variables as Record<string, unknown>);
      return { data };
    },

    update: async ({ resource, id, variables }) => {
      const v = variables as Record<string, unknown>;
      // A todo `done` toggle maps to the dedicated set_done RPC; other fields to update.
      if (resource === "todo" && "done" in v) {
        const data = await callRpc<any>(cfg, "miniapp.todo.set_done", { id, done: v.done });
        return { data };
      }
      const m = mapFor(resource);
      if (!m.update) throw new Error(`${resource}: update unsupported`);
      const data = await callRpc<any>(cfg, m.update, { id, ...v });
      return { data };
    },

    deleteOne: async ({ resource, id }) => {
      const m = mapFor(resource);
      if (!m.remove) throw new Error(`${resource}: delete unsupported`);
      const data = await callRpc<any>(cfg, m.remove, { id });
      return { data };
    },
  };
}

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

// Deneb-backed Refine data provider. RPC payloads are dynamic, so the provider
// works in `any` at this boundary and Refine re-applies the caller's TData on the
// way out (its CRUD methods are generic over caller-supplied TData).
export function denebDataProvider(cfg: GatewayConfig): DataProvider {
  return {
    getApiUrl: () => cfg.url,

    getList: async ({ resource }) => {
      const rows = await callRpc<any[]>(cfg, mapFor(resource).list, {});
      const data = Array.isArray(rows) ? rows : [];
      return { data, total: data.length };
    },

    getOne: async ({ resource, id }) => {
      // todo has no dedicated "get" — read the list and find. mail/calendar add getOne later.
      const rows = await callRpc<any[]>(cfg, mapFor(resource).list, {});
      const found = (rows ?? []).find((r) => String(r.id) === String(id));
      return { data: found ?? { id } };
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

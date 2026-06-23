import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DataProvider } from "@refinedev/core";
import { fakeProvider, renderWithProviders } from "@/test/util";
import { CalendarPane } from "./CalendarPane";

// fakeProvider + a create/update sink, so tests pin the exact wire params the form
// sends (the calendar create/update shape is best-effort vs the live gateway).
function capturing(fixtures: Record<string, unknown[]>, sink: Record<string, unknown>[]): DataProvider {
  const base = fakeProvider(fixtures);
  return {
    ...base,
    create: async (a) => {
      sink.push({ op: "create", ...a });
      return base.create(a);
    },
    update: async (a) => {
      sink.push({ op: "update", ...a });
      return base.update(a);
    },
  };
}

describe("CalendarPane", () => {
  it("creates an event through the form", async () => {
    const calls: Record<string, unknown>[] = [];
    renderWithProviders(<CalendarPane />, { connected: true, dataProvider: capturing({ calendar: [] }, calls) });

    await userEvent.click(screen.getByRole("button", { name: "새 일정" }));
    await userEvent.type(await screen.findByLabelText("제목"), "신규 미팅");
    fireEvent.change(screen.getByLabelText("시작"), { target: { value: "2026-07-01T10:00" } });
    fireEvent.change(screen.getByLabelText("종료"), { target: { value: "2026-07-01T11:00" } });
    await userEvent.type(screen.getByLabelText("장소"), "회의실 B");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    const created = calls.find((c) => c.op === "create");
    expect(created?.resource).toBe("calendar");
    const v = created?.variables as Record<string, unknown>;
    expect(v.summary).toBe("신규 미팅");
    expect(v.location).toBe("회의실 B");
    expect(v.allDay).toBe(false);
    expect(String(v.start)).toContain("2026-07-01");
    expect(String(v.end)).toContain("2026-07-01");
  });

  it("opens a read-only detail for Google (non-local) events", async () => {
    const events = [{ id: "g1", summary: "외부 회의", start: "2026-07-02T05:00:00Z", end: "2026-07-02T06:00:00Z" }];
    renderWithProviders(<CalendarPane />, { connected: true, dataProvider: fakeProvider({ calendar: events }) });

    await userEvent.click(await screen.findByText("외부 회의"));
    expect(await screen.findByText(/외부\(구글\) 일정은 여기서 수정할 수 없습니다/)).toBeInTheDocument();
    // No editable form → no 저장 button in the read-only detail.
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });
});

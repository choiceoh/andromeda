import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { CalendarPane } from "./CalendarPane";
import { fakeProvider, renderWithProviders } from "@/test/util";

// June 2026 events: one timed, one all-day local (deletable). Fake only Date so
// the visible month defaults to June and these land on the grid deterministically.
const events = [
  { id: "e1", summary: "기획 리뷰", start: "2026-06-18T05:00:00Z", end: "2026-06-18T06:00:00Z" },
  { id: "e2", summary: "연차", start: { date: "2026-06-22" }, end: { date: "2026-06-23" }, allDay: true, local: true },
];

describe("CalendarPane (일정 달력)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T09:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("renders a month calendar with weekday headers and the month's events", async () => {
    renderWithProviders(<CalendarPane />, { connected: true, dataProvider: fakeProvider({ calendar: events }) });
    // weekday header row (한국어)
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("토")).toBeInTheDocument();
    // events show up (a chip in the grid + a row in the list → at least one match each)
    expect((await screen.findAllByText(/기획 리뷰/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/연차/)).length).toBeGreaterThan(0);
  });

  it("keeps the upcoming list with a delete action for local events", async () => {
    renderWithProviders(<CalendarPane />, { connected: true, dataProvider: fakeProvider({ calendar: events }) });
    expect(await screen.findByText("다가오는 일정")).toBeInTheDocument();
    // only the local event (연차) is deletable; the Google-sourced one is read-only
    expect(await screen.findByTitle("삭제")).toBeInTheDocument();
  });

  it("shows a connect notice and no calendar when disconnected", () => {
    renderWithProviders(<CalendarPane />, { connected: false });
    expect(screen.getByText(/게이트웨이에 연결하면/)).toBeInTheDocument();
    // weekday headers only exist when the grid renders (connected)
    expect(screen.queryByText("일")).not.toBeInTheDocument();
  });
});

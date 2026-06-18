import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { Workstation } from "./components/Workstation";
import { fakeProvider, renderWithProviders } from "./test/util";

beforeEach(() => {
  localStorage.clear();
  // Sidebar pings the gateway when connected; keep tests offline & deterministic.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline test"))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App (disconnected)", () => {
  it("renders the workstation shell with registry-driven nav", () => {
    renderWithProviders(<App />);
    expect(screen.getByRole("heading", { name: "Andromeda" })).toBeInTheDocument();
    for (const label of ["할일", "문서", "메일", "일정"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText(/게이트웨이에 연결하면/)).toBeInTheDocument();
  });
});

describe("Workstation (connected, fixtures)", () => {
  const dataProvider = fakeProvider({
    todo: [{ id: 1, title: "세금 신고", done: false }],
    mail: [{ id: "m1", subject: "분기 보고서", from: "lead@corp.com" }],
  });

  it("lands on the 오늘 dashboard and switches to a resource pane", async () => {
    renderWithProviders(<Workstation cfg={{ url: "http://test", token: "tok" }} setCfg={() => {}} />, {
      connected: true,
      dataProvider,
    });
    // The dashboard is the landing view and aggregates several resources at once.
    expect(await screen.findByText("세금 신고")).toBeInTheDocument();
    expect(screen.getByText(/분기 보고서/)).toBeInTheDocument();

    // The dashboard has no add-todo form; the 할일 pane does — proves the switch.
    // Scope the nav click to the sidebar (the dashboard also has a 할일 card button).
    expect(screen.queryByPlaceholderText("새 할일…")).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    await userEvent.click(within(nav).getByRole("button", { name: /할일/ }));
    expect(await screen.findByPlaceholderText("새 할일…")).toBeInTheDocument();
  });
});

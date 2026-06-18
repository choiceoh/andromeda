import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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

  it("renders grid rows from the data provider and switches panes", async () => {
    renderWithProviders(<Workstation cfg={{ url: "http://test", token: "tok" }} setCfg={() => {}} />, {
      connected: true,
      dataProvider,
    });
    // Todo pane is the default view.
    expect(await screen.findByText("세금 신고")).toBeInTheDocument();

    // Switching to the mail pane loads its resource.
    await userEvent.click(screen.getByRole("button", { name: /메일/ }));
    expect(await screen.findByText("분기 보고서")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { relatedResourcesForResource, relatedResourcesForTools } from "./resourceRefresh";

describe("resource refresh mapping", () => {
  it("expands calendar resources because the dashboard and month pane use different lists", () => {
    expect(relatedResourcesForResource("calendar-range")).toEqual(["calendar", "calendar-range"]);
  });

  it("maps AI tool names to every resource cache they can affect", () => {
    expect(new Set(relatedResourcesForTools(["miniapp.gmail.trash", "miniapp.calendar.create"], "todo"))).toEqual(
      new Set(["todo", "mail", "calendar", "calendar-range"]),
    );
  });
});

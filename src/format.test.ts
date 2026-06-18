import { describe, expect, it } from "vitest";
import { calSpan, calStamp, errText, fmtDate, text } from "./format";

describe("text", () => {
  it("returns strings as-is", () => {
    expect(text("hi")).toBe("hi");
  });
  it("falls back past an empty name to the email", () => {
    expect(text({ name: "", email: "person@example.com" })).toBe("person@example.com");
  });
  it("prefers a present name", () => {
    expect(text({ name: "Kim", email: "k@e.com" })).toBe("Kim");
  });
  it("is empty for null/empty objects", () => {
    expect(text(null)).toBe("");
    expect(text({})).toBe("");
  });
});

describe("fmtDate", () => {
  it("is empty for undefined", () => {
    expect(fmtDate(undefined)).toBe("");
  });
  it("passes through unparseable input", () => {
    expect(fmtDate("not a date")).toBe("not a date");
  });
});

describe("calStamp", () => {
  it("flags { date } and bare YYYY-MM-DD as all-day", () => {
    expect(calStamp({ date: "2026-06-17" })).toEqual({ iso: "2026-06-17", allDay: true });
    expect(calStamp("2026-06-17")).toEqual({ iso: "2026-06-17", allDay: true });
  });
  it("flags { dateTime } and full ISO as timed", () => {
    expect(calStamp({ dateTime: "2026-06-17T10:00:00Z" })).toEqual({ iso: "2026-06-17T10:00:00Z", allDay: false });
    expect(calStamp("2026-06-17T10:00:00Z").allDay).toBe(false);
  });
});

describe("calSpan", () => {
  it("renders a single all-day event as one date (no range)", () => {
    const span = calSpan({ date: "2026-06-17" }, { date: "2026-06-18" });
    expect(span).not.toContain("~");
    expect(span).toContain("17");
  });
  it("steps back Google's exclusive all-day end.date", () => {
    const span = calSpan({ date: "2026-06-17" }, { date: "2026-06-20" });
    expect(span).toContain("~");
    expect(span).toContain("19"); // 20 is exclusive → last inclusive day is 19
    expect(span).not.toContain("20");
  });
  it("renders timed events as a range", () => {
    const span = calSpan("2026-06-17T10:00:00Z", "2026-06-17T11:00:00Z");
    expect(span).toContain("~");
  });
});

describe("errText", () => {
  it("reads .message off error-shaped objects", () => {
    expect(errText({ message: "boom" })).toBe("boom");
  });
  it("passes strings through and defaults on nullish", () => {
    expect(errText("x")).toBe("x");
    expect(errText(null)).toBe("알 수 없는 오류");
  });
});

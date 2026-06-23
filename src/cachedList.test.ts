import { afterEach, describe, expect, it } from "vitest";
import { cachedListStorageKey, cachedOneStorageKey, clearCachedResource } from "./cachedList";

afterEach(() => {
  localStorage.clear();
});

describe("clearCachedResource", () => {
  it("clears exact list caches, range-key variants, and one-record caches", () => {
    localStorage.setItem(cachedListStorageKey("mail"), "list");
    localStorage.setItem(cachedOneStorageKey("mail", "m1"), "one");
    localStorage.setItem(cachedListStorageKey("calendar-range.2026-06"), "range");
    localStorage.setItem(cachedListStorageKey("mailbox"), "keep");

    clearCachedResource("mail");
    clearCachedResource("calendar-range");

    expect(localStorage.getItem(cachedListStorageKey("mail"))).toBeNull();
    expect(localStorage.getItem(cachedOneStorageKey("mail", "m1"))).toBeNull();
    expect(localStorage.getItem(cachedListStorageKey("calendar-range.2026-06"))).toBeNull();
    expect(localStorage.getItem(cachedListStorageKey("mailbox"))).toBe("keep");
  });
});

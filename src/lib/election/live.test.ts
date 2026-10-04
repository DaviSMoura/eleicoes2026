import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeHistory, safeSetItem, type HistoryPoint } from "./live";

const pt = (sections: number, valid = sections * 10): HistoryPoint => ({
  sections,
  progress: sections / 10,
  tseAt: "",
  valid,
  votes: {},
});

describe("mergeHistory", () => {
  it("keeps the points we have when a response comes back cut short", () => {
    // What happened on election night: the history query hit its row cap and only the first
    // point (nothing counted) of the Brasil race came back.
    const have = [pt(0, 0), pt(100), pt(200), pt(300)];
    expect(mergeHistory(have, [pt(0, 0)])).toEqual(have);
  });

  it("adds new points in order", () => {
    expect(mergeHistory([pt(0, 0), pt(200)], [pt(100), pt(300)]).map((h) => h.sections)).toEqual([
      0, 100, 200, 300,
    ]);
  });

  it("returns what it has when nothing arrives", () => {
    const have = [pt(0, 0), pt(100)];
    expect(mergeHistory(have, [])).toBe(have);
  });
});

describe("safeSetItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("drops the race cache to make room when storage is full", () => {
    localStorage.setItem("eleicoes2026:race:sp-c0007-e006259", "x".repeat(10));
    localStorage.setItem("apuracao26:theme", "dark");
    const real = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      calls++;
      if (calls === 1) throw new DOMException("full", "QuotaExceededError");
      real.call(this, k, v);
    });
    expect(safeSetItem("apuracao26:cols:v3", '["sp"]')).toBe(true);
    expect(localStorage.getItem("apuracao26:cols:v3")).toBe('["sp"]');
    expect(localStorage.getItem("eleicoes2026:race:sp-c0007-e006259")).toBeNull();
    expect(localStorage.getItem("apuracao26:theme")).toBe("dark");
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(safeSetItem("apuracao26:theme", "dark")).toBe(false);
  });
});

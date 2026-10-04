import { describe, expect, it } from "vitest";

import { mergeHistory, type HistoryPoint } from "./live";

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

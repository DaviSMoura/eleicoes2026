import type { TrendPoint } from "@/lib/election/live";

// Trend values live under "<candidate id>~t" in the same chart rows as the real ones, so the
// dashed line can continue the solid one on the same axes.
export const TREND_SUFFIX = "~t";
export const isTrendKey = (key: string) => key.endsWith(TREND_SUFFIX);

export function mergeTrend(
  rows: Record<string, number>[],
  path: TrendPoint[],
  ids: string[],
): Record<string, number>[] {
  if (path.length === 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  for (const point of path) {
    const row: Record<string, number> = { p: Math.round(point.p * 10) / 10 };
    for (const id of ids) row[id + TREND_SUFFIX] = point.shares.get(id) ?? 0;
    out.push(row);
  }
  return out.sort((a, b) => (a["p"] ?? 0) - (b["p"] ?? 0));
}

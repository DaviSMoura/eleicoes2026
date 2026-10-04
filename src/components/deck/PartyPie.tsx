import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { CHAMBER_COLORED, chamberColors, type Chamber } from "@/lib/election/live";

const pct = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

type Slice = { party: string; seats: number; color: number };

// Donut of seats per party, with the full list beside it. Hover a slice or a row to read it in
// the middle of the donut.
export function PartyPie({ chamber, label }: { chamber: Chamber; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const { slices, colorOf } = useMemo(() => {
    const colorOf = chamberColors(chamber);
    const top = chamber.parties.filter((p) => p.seats > 0).slice(0, CHAMBER_COLORED);
    const others = chamber.parties.slice(CHAMBER_COLORED).reduce((n, p) => n + p.seats, 0);
    const slices: Slice[] = top.map((p) => ({
      party: p.party,
      seats: p.seats,
      color: colorOf(p.party),
    }));
    if (others > 0) slices.push({ party: "Outros", seats: others, color: 0 });
    return { slices, colorOf };
  }, [chamber]);

  const total = chamber.parties.reduce((n, p) => n + p.seats, 0);
  if (total === 0)
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aguardando votos</p>;

  const shown = active ? chamber.parties.find((p) => p.party === active) : undefined;
  const activeSlice = shown && colorOf(shown.party) > 0 ? shown.party : active ? "Outros" : null;
  const othersSeats = slices.find((s) => s.party === "Outros")?.seats ?? 0;
  const activeSeats = active === "Outros" ? othersSeats : (shown?.seats ?? 0);

  return (
    <div className="px-3 pt-2">
      <div className="relative mx-auto size-[184px]">
        <PieChart width={184} height={184} accessibilityLayer={false}>
          <Pie
            data={slices}
            dataKey="seats"
            nameKey="party"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={90}
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseLeave={() => setActive(null)}
            onMouseEnter={(_, i) => setActive(slices[i]?.party ?? null)}
          >
            {slices.map((s) => (
              <Cell
                key={s.party}
                fill={`var(--party-${s.color})`}
                opacity={activeSlice && activeSlice !== s.party ? 0.35 : 1}
              />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="max-w-[100px] truncate text-[11px] font-semibold">{active}</span>
              <span className="tnum text-xl font-bold leading-tight">{activeSeats}</span>
              <span className="tnum text-[11px] text-muted-foreground">
                {pct((activeSeats / total) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="tnum text-xl font-bold leading-tight">
                {total.toLocaleString("pt-BR")}
              </span>
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </>
          )}
        </div>
      </div>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1 text-left font-normal">Partido</th>
            <th className="pb-1 text-right font-normal">Vagas</th>
            <th className="pb-1 text-right font-normal">%</th>
            {chamber.settled > 0 && <th className="pb-1 text-right font-normal">Definidas</th>}
          </tr>
        </thead>
        <tbody>
          {chamber.parties.map((p) => (
            <tr
              key={p.party}
              onMouseEnter={() => setActive(p.party)}
              onMouseLeave={() => setActive(null)}
              className={active === p.party ? "bg-accent" : undefined}
            >
              <td className="py-0.5">
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: `var(--party-${colorOf(p.party)})` }}
                  />
                  {p.party}
                </span>
              </td>
              <td className="tnum py-0.5 text-right font-semibold">{p.seats}</td>
              <td className="tnum py-0.5 text-right text-muted-foreground">
                {pct((p.seats / total) * 100)}%
              </td>
              {chamber.settled > 0 && (
                <td className="tnum py-0.5 text-right text-muted-foreground">{p.settled || "-"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from "react";
import { ChevronLeft, ChevronRight, X, MapPin } from "lucide-react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  OFFICES,
  fmtClock,
  validVotes,
  zoneLeader,
  zoneProgress,
  type CityState,
  type Office,
} from "@/lib/election/mock";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const partyColor = (c: number) => `var(--party-${c})`;
const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

type Props = {
  state: CityState;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

export function CityColumn({ state, onRemove, onMove, isFirst, isLast }: Props) {
  const [office, setOffice] = useState<Office>("presidente");
  const { city, progress } = state;
  const done = progress >= 100;

  return (
    <section
      id={`col-${state.id}`}
      className="flex h-full w-[340px] shrink-0 flex-col border-r border-border bg-card"
    >
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold leading-tight">{city.name}</h2>
            <p className="text-xs text-muted-foreground">
              {city.uf} · {nf.format(city.electorate)} eleitores
            </p>
          </div>
          <div className="flex text-muted-foreground">
            <button aria-label="Mover para a esquerda" disabled={isFirst} onClick={() => onMove(-1)} className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </button>
            <button aria-label="Mover para a direita" disabled={isLast} onClick={() => onMove(1)} className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-30">
              <ChevronRight className="size-4" />
            </button>
            <button aria-label="Remover coluna" onClick={onRemove} className="rounded p-1 hover:bg-accent hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="px-3 pb-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              {done ? "Totalização concluída" : "Seções totalizadas"}
            </span>
            <span className="tnum font-semibold">{pct(progress)}%</span>
          </div>
          <div className="mt-1 h-[3px] w-full bg-muted">
            <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span className="tnum">Comparecimento {pct(state.turnout * 100, 1)}%</span>
            <span className="tnum">{nf.format(validVotes(state))} válidos</span>
          </div>
        </div>
        <nav className="flex">
          {OFFICES.map((o) => (
            <button
              key={o.id}
              onClick={() => setOffice(o.id)}
              className={`flex-1 border-b-2 py-2 text-xs font-semibold transition-colors ${
                office === o.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Scoreboard state={state} office={office} />
        <Evolution state={state} office={office} />
        <Zones state={state} office={office} />
        <Feed state={state} />
      </div>
    </section>
  );
}

function Scoreboard({ state, office }: { state: CityState; office: Office }) {
  const o = state.offices[office];
  const total = validVotes(state);
  const rows = o.candidates
    .map((c, i) => ({ c, share: o.shares[i] ?? 0 }))
    .sort((a, b) => (a.c.name === "Outros" ? 1 : b.c.name === "Outros" ? -1 : b.share - a.share));
  const isDep = office === "deputados";
  const shown = isDep ? rows.slice(0, 10) : rows;

  return (
    <div className="border-b border-border">
      {shown.map(({ c, share }, idx) => {
        const leader = idx === 0;
        return (
          <div key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/60">
            {isDep ? (
              <span className="tnum w-5 text-right text-xs text-muted-foreground">{idx + 1}º</span>
            ) : (
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-primary-foreground"
                style={{ background: partyColor(c.color) }}
              >
                {initials(c.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[13px] ${leader ? "font-bold" : "font-medium"}`}>
                  {c.name}
                  {c.number && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.party} · {c.number}</span>}
                </span>
                <span className={`tnum shrink-0 ${leader ? "text-[15px] font-bold" : "text-[13px] font-semibold"}`}>
                  {pct(share * 100)}%
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 bg-muted">
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{ width: `${share * 100}%`, background: isDep ? "var(--primary)" : partyColor(c.color) }}
                  />
                </div>
                <span className="tnum w-[76px] text-right text-[11px] text-muted-foreground">
                  {nf.format(Math.round(share * total))}
                </span>
              </div>
            </div>
            {isDep && idx < 4 && state.progress > 60 && (
              <span className="rounded-sm border border-border px-1 text-[10px] text-muted-foreground">eleito*</span>
            )}
          </div>
        );
      })}
      {isDep && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          Mais votados no município. *Projeção depende do quociente estadual.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="px-3 pt-3 text-xs font-bold text-muted-foreground">{children}</h3>;
}

function Evolution({ state, office }: { state: CityState; office: Office }) {
  const o = state.offices[office];
  const lines = office === "deputados" ? o.candidates.slice(0, 4) : o.candidates.filter((c) => c.name !== "Outros");
  const depColors = [1, 2, 3, 4];
  return (
    <div className="border-b border-border pb-2">
      <SectionTitle>Evolução por % apurado</SectionTitle>
      <LineChart width={330} height={130} data={o.history} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="p" type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 4 }}
          labelFormatter={(v) => `${v}% apurado`}
          formatter={(v: number, k: string) => [`${pct(v)}%`, o.candidates.find((c) => c.id === k)?.name ?? k]}
        />
        {lines.map((c, i) => (
          <Line key={c.id} dataKey={c.id} dot={false} isAnimationActive={false} strokeWidth={1.75} stroke={partyColor(office === "deputados" ? (depColors[i] ?? 1) : c.color)} />
        ))}
      </LineChart>
    </div>
  );
}

function Zones({ state, office }: { state: CityState; office: Office }) {
  const o = state.offices[office];
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Zonas eleitorais · mais votado</SectionTitle>
      <div className="mt-2 grid grid-cols-6 gap-px px-3">
        {state.zones.map((z, i) => {
          const zp = zoneProgress(state, i);
          const lead = o.candidates[zoneLeader(state, office, i)]!;
          const color = office === "deputados" ? "var(--primary)" : partyColor(lead.color);
          return (
            <div
              key={z.n}
              title={`Zona ${z.n} · ${pct(zp, 1)}% · ${lead.name}`}
              className="relative flex aspect-square items-end justify-start p-1 text-[10px] font-semibold text-primary-foreground"
              style={{ background: color, opacity: 0.25 + (zp / 100) * 0.75 }}
            >
              <span className="tnum">{z.n}</span>
            </div>
          );
        })}
      </div>
      {office !== "deputados" && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-muted-foreground">
          {o.candidates
            .filter((c) => c.name !== "Outros")
            .map((c) => (
              <span key={c.id} className="flex items-center gap-1">
                <span className="size-2" style={{ background: partyColor(c.color) }} />
                {c.name.split(" ").slice(-1)[0]}
              </span>
            ))}
          <span>· opacidade = % apurado</span>
        </div>
      )}
    </div>
  );
}

function Feed({ state }: { state: CityState }) {
  return (
    <div>
      <SectionTitle>Atualizações</SectionTitle>
      <ul className="mt-1">
        {state.feed.map((f) => (
          <li key={f.id} className="flex gap-2.5 border-t border-border px-3 py-2.5 first:border-t-0 animate-fade-in">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-muted-foreground">
              {state.city.uf}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1 text-[13px]">
                <span className="font-bold">Apuração {state.city.name}</span>
                <span className="tnum text-xs text-muted-foreground">· {fmtClock(f.time)}</span>
              </div>
              {f.kind === "virada" && <span className="text-[11px] font-semibold text-destructive">VIRADA</span>}
              <p className="text-[13px] leading-snug">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

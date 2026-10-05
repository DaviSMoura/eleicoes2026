import { Tip } from "./Tip";
import { ResultBadge } from "./ResultBadge";
import { VoteStatusBadge } from "./VoteStatusBadge";
import { Quociente } from "./Quociente";
import { CandidateDetail } from "./CandidateDetail";
import { isTrendKey, mergeTrend, TREND_SUFFIX } from "./trend-chart";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Search,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  candidatePhoto,
  displayName,
  fmtTime,
  isProportional,
  officesFor,
  roundShares,
  trendPath,
  turnoutPct,
  trendsFor,
  useColumn,
  pointValidOf,
  validOf,
  voteStatusOf,
  type Place,
  type Race,
} from "@/lib/election/live";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const partyColor = (c: number) => `var(--party-${c})`;
const initials = (n: string) =>
  n
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

function useAnimated(value: number, ms = 700) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (value - a) * e;
      setV(cur);
      from.current = cur;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

function Num({ value, format }: { value: number; format: (n: number) => string }) {
  return <>{format(useAnimated(value))}</>;
}

type Props = {
  place: Place;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

export function CityColumn({ place, onRemove, onMove, isFirst, isLast }: Props) {
  const offices = officesFor(place.id);
  const [cargo, setCargo] = useState(offices[0]!.cargo);
  const [parties, setParties] = useState<string[]>([]);
  // Candidate page open in this column; the list stays mounted (hidden) to keep its state.
  const [selected, setSelected] = useState<string | null>(null);
  const column = useColumn(place.id);
  const race = column.races.get(cargo);
  const national = place.kind === "br";

  const available = race ? Array.from(new Set(race.meta.candidates.map((c) => c.party))) : [];
  const toggle = (p: string) =>
    setParties((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const progress = race?.data.progress ?? 0;
  const done = progress >= 100;
  const electorate = column.races.get(offices[0]!.cargo)?.data.electorate ?? 0;

  return (
    <section
      id={`col-${place.id}`}
      className="flex h-full w-[340px] shrink-0 animate-col-in flex-col border-r border-border bg-card"
    >
      {selected && race && (
        <CandidateDetail
          race={race}
          place={place}
          ufRaces={column.ufRaces}
          candidateId={selected}
          onBack={() => setSelected(null)}
        />
      )}
      <div className={`min-h-0 flex-1 flex-col ${selected && race ? "hidden" : "flex"}`}>
        <header className="shrink-0 border-b border-border">
          <div className="flex items-center gap-2 px-3 pb-2 pt-3">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold leading-tight">{place.name}</h2>
              <p className="truncate text-xs text-muted-foreground">
                {national ? "Geral" : place.kind === "uf" ? "Estado" : place.uf}
                {electorate > 0 && <> · {nf.format(electorate)} eleitores</>}
              </p>
            </div>
            <div className="flex text-muted-foreground">
              <Tip side="bottom" label="Mover para a esquerda">
                <button
                  aria-label="Mover para a esquerda"
                  disabled={isFirst}
                  onClick={() => onMove(-1)}
                  className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </button>
              </Tip>
              <Tip side="bottom" label="Mover para a direita">
                <button
                  aria-label="Mover para a direita"
                  disabled={isLast}
                  onClick={() => onMove(1)}
                  className="rounded p-1 hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="size-4" />
                </button>
              </Tip>
              <Tip side="bottom" label="Remover coluna">
                <button
                  aria-label="Remover coluna"
                  onClick={onRemove}
                  className="rounded p-1 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </Tip>
            </div>
          </div>
          <div className="px-3 pb-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">
                {done ? "Totalização concluída" : "Seções totalizadas"}
              </span>
              <span className="tnum font-semibold">
                <Num value={progress} format={(n) => pct(n)} />%
              </span>
            </div>
            <div className="mt-1 h-[3px] w-full overflow-hidden bg-muted">
              <div
                className="relative h-full overflow-hidden bg-primary transition-[width] duration-700"
                style={{ width: `${progress}%` }}
              >
                {!done && progress > 0 && (
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-primary-foreground/60 to-transparent" />
                )}
              </div>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span className="tnum">
                Comparecimento{" "}
                {race && turnoutPct(race.data) !== null
                  ? `${pct(turnoutPct(race.data)!, 1)}%`
                  : "-"}
              </span>
              <span className="tnum">
                <Num value={race?.data.valid ?? 0} format={(n) => nf.format(Math.round(n))} />{" "}
                válidos
              </span>
            </div>
          </div>
          <nav className="flex">
            {offices.map((o) => (
              <button
                key={o.cargo}
                onClick={() => {
                  setCargo(o.cargo);
                  setSelected(null);
                  setParties([]);
                }}
                className={`flex-auto whitespace-nowrap border-b-2 px-1 py-2 text-[11px] font-semibold transition-colors ${
                  cargo === o.cargo
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </nav>
          {available.length > 1 && (
            <div className="flex gap-1 overflow-x-auto px-3 py-2">
              <button
                onClick={() => setParties([])}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${parties.length === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Todos
              </button>
              {available.map((p) => (
                <button
                  key={p}
                  onClick={() => toggle(p)}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${parties.includes(p) ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          {race ? (
            <>
              <Scoreboard
                key={race.meta.key}
                race={race}
                parties={parties}
                ufRaces={column.ufRaces}
                onSelect={setSelected}
              />
              {isDeputados(race) && <Quociente race={race} place={place} />}
              <Trends race={race} parties={parties} ufRaces={column.ufRaces} />
              <Evolution race={race} parties={parties} ufRaces={column.ufRaces} />
              {national && <States br={race} ufRaces={column.ufRaces} />}
              <Feed race={race} place={place} />
            </>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Carregando dados do TSE...
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const isDeputados = (race: Race) => isProportional(race.meta.cargo);

function Avatar({ race, id, name }: { race: Race; id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  // Deputados are too many for a color per candidate: keep their ring neutral.
  const color = isDeputados(race) ? "var(--muted-foreground)" : partyColor(race.colors[id] ?? 0);
  return (
    <span
      className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-bold text-primary-foreground"
      style={{ background: color, boxShadow: `0 0 0 2px ${color}` }}
    >
      {initials(name)}
      {!failed && (
        <img
          src={candidatePhoto(race.meta, id)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

const PAGE_FIRST = 10;
const PAGE_MORE = 50;
const normalize = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function Scoreboard({
  race,
  parties,
  ufRaces,
  onSelect,
}: {
  race: Race;
  parties: string[];
  ufRaces: Race[];
  onSelect: (id: string) => void;
}) {
  const { meta, data } = race;
  const valid = validOf(data);
  const byId = new Map(data.votes.map(([id, v, s]) => [id, { votes: v, status: s }]));
  const rows = meta.candidates
    .map((c) => ({ c, votes: byId.get(c.id)?.votes ?? 0, status: byId.get(c.id)?.status ?? "" }))
    .sort((a, b) => b.votes - a.votes || a.c.seq - b.c.seq);
  const isDep = isDeputados(race);
  const [limit, setLimit] = useState(PAGE_FIRST);
  const [query, setQuery] = useState("");
  const leaderId = data.progress > 0 ? rows[0]?.c.id : undefined;
  const rank = useMemo(() => new Map(rows.map((r, i) => [r.c.id, i])), [rows]);
  const q = normalize(query.trim());
  const filtered = rows.filter(
    (r) =>
      (!parties.length || parties.includes(r.c.party)) &&
      (!q || normalize(`${r.c.name} ${r.c.number} ${r.c.party}`).includes(q)),
  );
  const searchable = rows.length > PAGE_FIRST;
  const paged = isDep || q;
  const shown = paged ? filtered.slice(0, limit) : filtered;
  const rest = filtered.length - shown.length;
  const rankOf = (id: string) => rank.get(id) ?? 0;
  const tr = trendsFor(race, ufRaces);
  const deltaOf = (id: string) => tr.items.find((t) => t.id === id)?.delta ?? 0;

  return (
    <div className="border-b border-border">
      {searchable && (
        <label className="mx-3 mt-2 flex items-center gap-2 rounded border border-input bg-background px-2 py-1 focus-within:border-primary">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_FIRST);
            }}
            placeholder="Buscar candidato, número ou partido"
            aria-label="Buscar candidato"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      )}
      {shown.length === 0 && (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {q ? "Nenhum candidato encontrado." : "Nenhum candidato deste partido para o cargo."}
        </p>
      )}
      {shown.map(({ c, votes, status }) => {
        const idx = rankOf(c.id);
        const leader = c.id === leaderId;
        const share = valid > 0 ? votes / valid : 0;
        const name = displayName(c.name);
        return (
          <div
            key={leader ? `${c.id}-lead` : c.id}
            role="button"
            tabIndex={0}
            aria-label={`Ver detalhes de ${name}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
            className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 ${leader ? "animate-flash" : ""}`}
          >
            {isDep && (
              <span className="tnum w-8 shrink-0 text-right text-xs text-muted-foreground">
                {nf.format(idx + 1)}º
              </span>
            )}
            <Avatar race={race} id={c.id} name={name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[13px] ${leader ? "font-bold" : "font-medium"}`}>
                  {name}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {c.party} · {c.number}
                  </span>
                </span>
                <span
                  className={`tnum shrink-0 ${leader ? "text-[15px] font-bold" : "text-[13px] font-semibold"}`}
                >
                  <Num value={share * 100} format={(n) => pct(n)} />%
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 bg-muted">
                  <div
                    className="h-full transition-[width] duration-700"
                    style={{
                      width: `${share * 100}%`,
                      background: isDep ? "var(--primary)" : partyColor(race.colors[c.id] ?? 0),
                    }}
                  />
                </div>
                <ResultBadge
                  status={status}
                  decided={tr.decided.includes(c.id)}
                  runoff={tr.inRunoff.includes(c.id)}
                />
                <VoteStatusBadge status={voteStatusOf(data, c.id)} />
                <Delta d={deltaOf(c.id)} />
                <span className="tnum w-[76px] text-right text-[11px] text-muted-foreground">
                  <Num value={votes} format={(n) => nf.format(Math.round(n))} />
                </span>
              </div>
            </div>
          </div>
        );
      })}
      {paged && (rest > 0 || limit > PAGE_FIRST) && (
        <div className="flex gap-3 px-3 pb-2 text-[11px] font-semibold">
          {rest > 0 && (
            <button
              onClick={() => setLimit((n) => n + PAGE_MORE)}
              className="text-primary hover:underline"
            >
              Mostrar mais ({nf.format(rest)} restantes)
            </button>
          )}
          {limit > PAGE_FIRST && (
            <button
              onClick={() => setLimit(PAGE_FIRST)}
              className="text-muted-foreground hover:text-foreground"
            >
              Mostrar menos
            </button>
          )}
        </div>
      )}
      {isDep && (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          Mais votados nesta abrangência. A eleição depende do quociente estadual.
        </p>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="px-3 pt-3 text-xs font-bold text-muted-foreground">{children}</h3>;
}

function TrendToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      className="text-[11px] font-semibold text-primary hover:underline"
    >
      {on ? "Ocultar tendência" : "Mostrar tendência"}
    </button>
  );
}

function Evolution({ race, parties, ufRaces }: { race: Race; parties: string[]; ufRaces: Race[] }) {
  const { meta, data, history } = race;
  const isDep = isDeputados(race);
  const [showTrend, setShowTrend] = useState(false);
  const ranked = [...meta.candidates].sort(
    (a, b) =>
      (data.votes.find((r) => r[0] === b.id)?.[1] ?? 0) -
      (data.votes.find((r) => r[0] === a.id)?.[1] ?? 0),
  );
  const base = ranked.slice(0, isDep ? 4 : 5);
  const lines = parties.length ? base.filter((c) => parties.includes(c.party)) : base;
  const depColors = [1, 2, 3, 4];
  const canTrend = data.progress > 0 && data.progress < 100;
  const points = useMemo(() => {
    const rows = history
      .filter((h) => h.valid > 0)
      .map((h) => {
        const valid = pointValidOf(h, data.blocked);
        const row: Record<string, number> = { p: Math.round(h.progress * 10) / 10 };
        for (const c of base) row[c.id] = ((h.votes[c.id] ?? 0) / valid) * 100;
        return row;
      });
    if (!showTrend || !canTrend) return rows;
    return mergeTrend(
      rows,
      trendPath(race, ufRaces),
      base.map((c) => c.id),
    );
  }, [history, base, showTrend, canTrend, race, ufRaces, data.blocked]);
  const colorOf = (id: string, i: number) =>
    partyColor(isDep ? (depColors[i] ?? 1) : (race.colors[id] ?? 0));
  return (
    <div className="border-b border-border pb-2">
      <div className="flex items-baseline justify-between pr-3">
        <SectionTitle>Evolução por % apurado</SectionTitle>
        {canTrend && history.length > 0 && (
          <TrendToggle on={showTrend} onToggle={() => setShowTrend((v) => !v)} />
        )}
      </div>
      {points.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          O gráfico começa com as primeiras seções totalizadas.
        </p>
      ) : (
        <LineChart
          width={330}
          height={130}
          data={points}
          margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="p"
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            stroke="var(--border)"
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              fontSize: 11,
              borderRadius: 4,
            }}
            labelFormatter={(v) => `${v}% apurado`}
            formatter={(v: number, k: string) => {
              const id = isTrendKey(k) ? k.slice(0, -TREND_SUFFIX.length) : k;
              const name = displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
              return [`${pct(v)}%`, isTrendKey(k) ? `${name} (tendência)` : name];
            }}
          />
          {lines.map((c, i) => (
            <Line
              key={c.id}
              dataKey={c.id}
              dot={false}
              isAnimationActive={false}
              type="monotone"
              connectNulls
              strokeWidth={1.75}
              stroke={colorOf(c.id, i)}
            />
          ))}
          {showTrend &&
            lines.map((c, i) => (
              <Line
                key={c.id + TREND_SUFFIX}
                dataKey={c.id + TREND_SUFFIX}
                dot={false}
                isAnimationActive={false}
                type="monotone"
                connectNulls
                strokeWidth={1.5}
                strokeDasharray="4 3"
                stroke={colorOf(c.id, i)}
              />
            ))}
        </LineChart>
      )}
      {showTrend && (
        <p className="px-3 pt-1 text-[11px] leading-snug text-muted-foreground">
          Tracejado: para onde cada um tende a ir até 100%, estimado pelo jeito que os votos que
          faltam devem se dividir. É estimativa, não resultado.
        </p>
      )}
    </div>
  );
}

function States({ br, ufRaces }: { br: Race; ufRaces: Race[] }) {
  const sorted = [...ufRaces].sort((a, b) => a.meta.abr.localeCompare(b.meta.abr));
  const legend = [...br.meta.candidates]
    .filter((c) => (br.colors[c.id] ?? 0) > 0)
    .sort((a, b) => (br.colors[a.id] ?? 0) - (br.colors[b.id] ?? 0));
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Estados · mais votado</SectionTitle>
      <div className="mt-2 grid grid-cols-6 gap-px px-3">
        {sorted.map((r) => {
          const lead = [...r.data.votes].sort((a, b) => b[1] - a[1])[0];
          const counted = r.data.progress > 0 && lead && lead[1] > 0;
          const color = counted ? partyColor(br.colors[lead[0]] ?? 0) : "var(--muted)";
          const name = counted
            ? displayName(r.meta.candidates.find((c) => c.id === lead[0])?.name ?? "")
            : "sem votos ainda";
          const label = r.meta.abr === "zz" ? "EXT" : r.meta.abr.toUpperCase();
          return (
            <div
              key={r.meta.key}
              title={`${label} · ${pct(r.data.progress, 1)}% · ${name}`}
              className={`relative flex aspect-square items-end justify-start p-1 text-[10px] font-semibold ${counted ? "text-white [text-shadow:0_0_3px_rgb(0_0_0/0.55)]" : "text-muted-foreground"}`}
              // Strength of the color shows how much was counted: only the background's alpha
              // changes (mixing with the surface would shift the party hue), and the label stays
              // readable.
              style={{
                background: counted
                  ? `color-mix(in oklab, ${color} ${Math.round(35 + (r.data.progress / 100) * 65)}%, transparent)`
                  : color,
                transition: "background-color .7s",
              }}
            >
              <span className="tnum">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-muted-foreground">
        {legend.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="size-2" style={{ background: partyColor(br.colors[c.id] ?? 0) }} />
            {displayName(c.name).split(" ").slice(-1)[0]}
          </span>
        ))}
        <span>· cor mais forte = mais apurado</span>
      </div>
    </div>
  );
}

type FeedItem = { id: string; at: string; kind: "marco" | "virada" | "info"; text: string };

function feedFor(race: Race, place: Place): FeedItem[] {
  const { meta, history } = race;
  const name = (id: string) => displayName(meta.candidates.find((c) => c.id === id)?.name ?? id);
  const leaderOf = (votes: Record<string, number>) =>
    Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  const items: FeedItem[] = [];
  const office = meta.office.toLowerCase();
  history.forEach((h, i) => {
    const prev = history[i - 1];
    const lead = leaderOf(h.votes);
    if (!lead || h.valid === 0) return;
    const leadPct = pct((lead[1] / pointValidOf(h, race.data.blocked)) * 100);
    for (const m of [10, 25, 50, 75, 90, 100]) {
      if ((prev?.progress ?? 0) < m && h.progress >= m) {
        items.push({
          id: `${meta.key}-m${m}`,
          at: h.tseAt,
          kind: "marco",
          text:
            m === 100
              ? `Totalização concluída em ${place.name}. ${name(lead[0])} termina com ${leadPct}% dos válidos para ${office}.`
              : `${m}% das seções totalizadas em ${place.name}. ${name(lead[0])} lidera para ${office} com ${leadPct}% dos válidos.`,
        });
      }
    }
    const prevLead = prev && prev.valid > 0 ? leaderOf(prev.votes) : undefined;
    if (prevLead && prevLead[0] !== lead[0]) {
      items.push({
        id: `${meta.key}-v${h.sections}`,
        at: h.tseAt,
        kind: "virada",
        text: `Virada para ${office}: ${name(lead[0])} passa ${name(prevLead[0])} com ${leadPct}% dos válidos.`,
      });
    }
  });
  return items.reverse();
}

function Feed({ race, place }: { race: Race; place: Place }) {
  const items = feedFor(race, place);
  const badge = place.kind === "br" ? "BR" : place.uf;
  return (
    <div>
      <SectionTitle>Atualizações</SectionTitle>
      <ul className="mt-1">
        {items.length === 0 && (
          <li className="px-3 py-2.5 text-[13px] text-muted-foreground">
            {race.data.progress > 0
              ? "Sem marcos ainda. Os destaques aparecem aqui conforme a apuração avança."
              : "Aguardando as primeiras seções totalizadas pelo TSE."}
          </li>
        )}
        {items.map((f) => (
          <li
            key={f.id}
            className={`flex gap-2.5 border-t border-border px-3 py-2.5 first:border-t-0 animate-feed-in ${f.kind === "virada" ? "bg-destructive/5" : ""}`}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-muted-foreground">
              {badge}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1 text-[13px]">
                <span className="font-bold">Apuração {place.name}</span>
                {f.at && (
                  <span className="tnum text-xs text-muted-foreground">· {fmtTime(f.at)}</span>
                )}
              </div>
              {f.kind === "virada" && (
                <span className="text-[11px] font-semibold text-destructive">VIRADA</span>
              )}
              <p className="text-[13px] leading-snug">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Delta({ d }: { d: number }) {
  if (Math.abs(d) < 0.05) return <span className="tnum text-[10px] text-muted-foreground">=</span>;
  const up = d > 0;
  return (
    <Tip label="Variação nas últimas atualizações">
      <span
        className={`tnum inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-[var(--party-4)]" : "text-destructive"}`}
      >
        {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
        {up ? "+" : ""}
        {pct(d, 1)}
      </span>
    </Tip>
  );
}

function Trends({ race, parties, ufRaces }: { race: Race; parties: string[]; ufRaces: Race[] }) {
  const { meta } = race;
  const tr = trendsFor(race, ufRaces);
  const byId = new Map(tr.items.map((t) => [t.id, t]));
  const winPct = new Map(
    roundShares(tr.items.map((t) => t.win * 100)).map((v, i) => [tr.items[i]!.id, v]),
  );
  const isDep = isDeputados(race);
  const started = race.data.progress > 0;
  let list = meta.candidates;
  if (parties.length) list = list.filter((c) => parties.includes(c.party));
  list = [...list]
    .sort((a, b) => byId.get(b.id)!.projected - byId.get(a.id)!.projected)
    .slice(0, isDep ? 5 : 4);
  const tone =
    tr.call.kind === "vitoria"
      ? "border-primary bg-primary/10"
      : tr.call.kind === "segundo-turno"
        ? "border-[var(--party-4)] bg-[var(--party-4)]/10"
        : tr.call.kind === "lider"
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-muted/40";
  const colorOf = (id: string, i: number) =>
    partyColor(isDep ? ([1, 2, 3, 4][i] ?? 0) : (race.colors[id] ?? 0));
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Tendências</SectionTitle>
      <div
        key={tr.call.text}
        className={`animate-feed-in mx-3 mt-2 rounded-sm border px-2.5 py-1.5 text-[12px] font-semibold ${tone}`}
      >
        {tr.call.text}
      </div>
      <div className="mt-2 space-y-1.5 px-3">
        <div className="flex text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">Candidato</span>
          <span className="w-[86px] whitespace-nowrap text-right">Projeção</span>
          {!isDep && (
            <Tip
              label={
                meta.seats > 1
                  ? `Chance de ficar entre os ${meta.seats} mais votados`
                  : "Chance de terminar em 1º lugar"
              }
            >
              <span className="w-[64px] whitespace-nowrap text-right">{tr.winLabel}</span>
            </Tip>
          )}
        </div>
        {list.map((c, i) => {
          const t = byId.get(c.id)!;
          return (
            <div key={c.id} className="flex items-center text-[12px]">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: colorOf(c.id, i) }}
                />
                <span className="truncate">{displayName(c.name)}</span>
              </span>
              <Tip
                label={`Margem de ±${pct(t.margin, 1)} p.p., diminui conforme a apuração avança`}
              >
                <span className="tnum w-[86px] text-right text-muted-foreground">
                  {started ? (
                    <>
                      {pct(t.projected, 1)}%{" "}
                      <span className="text-[10px]">±{pct(t.margin, 1)}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </span>
              </Tip>
              {!isDep && (
                <span className="tnum w-[64px] text-right font-semibold">
                  {started ? (
                    <>
                      <Num
                        value={winPct.get(c.id) ?? 0}
                        // Only a settled result is certain; a simulation never says 100%.
                        format={(n) =>
                          tr.decided.includes(c.id)
                            ? "100"
                            : t.win > 0.994
                              ? ">99"
                              : Math.round(n).toString()
                        }
                      />
                      %
                    </>
                  ) : (
                    "-"
                  )}
                </span>
              )}
            </div>
          );
        })}
        {tr.runoffPair && race.data.progress > 0 && (
          <div className="pt-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Chance de 2º turno</span>
              <span className="tnum font-semibold text-foreground">
                {Math.round(tr.runoff * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1 bg-muted">
              <div
                className="h-full bg-[var(--party-4)] transition-[width] duration-700"
                style={{ width: `${tr.runoff * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

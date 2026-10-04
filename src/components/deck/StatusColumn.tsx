import { useMemo, useState, type ReactNode } from "react";
import { Activity, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  colorsForParties,
  fmtFull,
  isSettled,
  raceStatus,
  STATE_LABEL,
  trendsFor,
  turnoutPct,
  useStatusRaces,
  type Race,
  type RaceStatus,
} from "@/lib/election/live";
import { BRAZIL_CENTROIDS, BRAZIL_PATHS, BRAZIL_VIEWBOX } from "./brazil-map.gen";
import { Tip } from "./Tip";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const partyColor = (c: number) => `var(--party-${c})`;

// Sequential scale, one hue: from the muted surface (nothing counted) to the primary (all).
// Square root so early-count differences (most states under 30%) are visible; the legend
// samples the same function, so it stays truthful.
const progressFill = (progress: number) =>
  `color-mix(in oklch, var(--primary) ${Math.round(12 + Math.sqrt(progress / 100) * 88)}%, var(--muted))`;

// Leader's party color; how strong it is shows how much was counted (alpha only, so the hue
// stays the party's).
const leaderFill = (st: RaceStatus) =>
  st.leader
    ? `color-mix(in oklab, ${partyColor(st.leader.color)} ${Math.round(35 + (st.progress / 100) * 65)}%, transparent)`
    : "var(--muted)";

const REGIONS: { name: string; ufs: string[] }[] = [
  { name: "Norte", ufs: ["ac", "am", "ap", "pa", "ro", "rr", "to"] },
  { name: "Nordeste", ufs: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"] },
  { name: "Centro-Oeste", ufs: ["df", "go", "ms", "mt"] },
  { name: "Sudeste", ufs: ["es", "mg", "rj", "sp"] },
  { name: "Sul", ufs: ["pr", "rs", "sc"] },
];

type View = "apuracao" | "presidente" | "governador" | "senador";
const VIEWS: { id: View; label: string }[] = [
  { id: "apuracao", label: "Apuração" },
  { id: "presidente", label: "Presidente" },
  { id: "governador", label: "Governador" },
  { id: "senador", label: "Senador" },
];

type Props = {
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

// The overview: how far the count is, and who leads (or already won) each state for
// Presidente, Governador and Senador.
export function StatusColumn({ onRemove, onMove, isFirst, isLast }: Props) {
  const st = useStatusRaces();
  const [view, setView] = useState<View>("apuracao");
  const br = st.br;
  const presUfs = useMemo(() => [...st.pres.values()], [st.pres]);

  return (
    <section
      id="col-status"
      className="flex h-full w-[340px] shrink-0 animate-col-in flex-col border-r border-border bg-card"
    >
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <Activity className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold leading-tight">Status da apuração</h2>
            <p className="truncate text-xs text-muted-foreground">
              {br?.data.tseAt ? `TSE, ${fmtFull(br.data.tseAt)}` : "Brasil e exterior"}
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
        <nav className="flex">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex-auto whitespace-nowrap border-b-2 px-1 py-2 text-[11px] font-semibold transition-colors ${
                view === v.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!br ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Carregando dados do TSE...
          </p>
        ) : view === "apuracao" ? (
          <>
            <National br={br} />
            <ProgressMap byUf={st.pres} />
            <Regions byUf={st.pres} />
            <Ranking ufRaces={presUfs} />
          </>
        ) : view === "presidente" ? (
          <OfficeView races={st.pres} national={{ br, ufs: presUfs }} office="Presidente" />
        ) : view === "governador" ? (
          <OfficeView races={st.gov} office="Governador" />
        ) : (
          <OfficeView races={st.sen} office="Senador" />
        )}
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="px-3 pt-3 text-xs font-bold text-muted-foreground">{children}</h3>;
}

function National({ br }: { br: Race }) {
  const d = br.data;
  const turnout = turnoutPct(d);
  return (
    <div className="border-b border-border px-3 pb-3 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Seções totalizadas no Brasil</span>
        <span className="tnum text-2xl font-bold">{pct(d.progress, 2)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-700"
          style={{ width: `${d.progress}%` }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Fact
          label="Seções apuradas"
          value={`${nf.format(d.sections)} de ${nf.format(d.sectionsTotal)}`}
        />
        <Fact label="Eleitores" value={nf.format(d.electorate)} />
        <Fact
          label="Comparecimento"
          value={turnout !== null && d.turnout > 0 ? `${pct(turnout)}%` : "-"}
        />
        <Fact label="Votos válidos" value={nf.format(d.valid)} />
      </dl>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tnum font-semibold">{value}</dd>
    </div>
  );
}

// Map of the 27 states. Each view decides the fill, the hover text and which states get a check.
function StateMap({
  fillOf,
  describe,
  checks,
  ariaLabel,
}: {
  fillOf: (uf: string) => string;
  describe: (uf: string) => ReactNode;
  checks?: Set<string> | undefined;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <>
      <p className="h-5 truncate px-3 pt-1 text-[11px]">
        {hover ? (
          describe(hover)
        ) : (
          <span className="text-muted-foreground">
            Passe o mouse num estado para ver os números
          </span>
        )}
      </p>
      <div className="px-3 pt-1">
        <svg viewBox={BRAZIL_VIEWBOX} className="w-full" role="img" aria-label={ariaLabel}>
          {Object.entries(BRAZIL_PATHS).map(([uf, d]) => (
            <path
              key={uf}
              d={d}
              fill={fillOf(uf)}
              stroke="var(--card)"
              strokeWidth={hover === uf ? 1.6 : 0.6}
              strokeLinejoin="round"
              onMouseEnter={() => setHover(uf)}
              onMouseLeave={() => setHover((h) => (h === uf ? null : h))}
              className="cursor-default transition-[fill] duration-700"
            />
          ))}
          {checks &&
            [...checks].map((uf) => {
              const c = BRAZIL_CENTROIDS[uf];
              if (!c) return null;
              return (
                <g key={uf} transform={`translate(${c[0]} ${c[1]})`} pointerEvents="none">
                  <circle r={5.5} fill="var(--card)" opacity={0.92} />
                  <path
                    d="M-2.6 0.2 L-0.8 2 L2.8 -1.8"
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
        </svg>
      </div>
    </>
  );
}

function ProgressMap({ byUf }: { byUf: Map<string, Race> }) {
  const abroad = byUf.get("zz");
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Onde já foi apurado</SectionTitle>
      <StateMap
        ariaLabel="Mapa do Brasil com o percentual apurado em cada estado"
        fillOf={(uf) => progressFill(byUf.get(uf)?.data.progress ?? 0)}
        describe={(uf) => (
          <>
            <span className="font-semibold">{uf.toUpperCase()}</span>{" "}
            <span className="tnum">{pct(byUf.get(uf)?.data.progress ?? 0, 2)}% apurado</span>
          </>
        )}
      />
      <div className="mt-2 flex items-center gap-2 px-3 text-[10px] text-muted-foreground">
        <span>0%</span>
        <span
          className="h-1.5 flex-1"
          style={{
            background: `linear-gradient(to right, ${[0, 10, 25, 50, 75, 100].map((p) => `${progressFill(p)} ${p}%`).join(", ")})`,
          }}
        />
        <span>100%</span>
      </div>
      {abroad && (
        <p className="mt-2 px-3 text-[11px] text-muted-foreground">
          Exterior:{" "}
          <span className="tnum font-semibold text-foreground">
            {pct(abroad.data.progress, 2)}%
          </span>{" "}
          apurado
        </p>
      )}
    </div>
  );
}

const ufLabel = (uf: string) => (uf === "zz" ? "Exterior" : uf.toUpperCase());

function OfficeView({
  races,
  office,
  national,
}: {
  races: Map<string, Race>;
  office: "Presidente" | "Governador" | "Senador";
  national?: { br: Race; ufs: Race[] };
}) {
  // Colors are per race inside a column; on a map with many races each party gets one color,
  // so PL, PP and UNIÃO (all blue-ish by preference) do not blend together.
  const statuses = useMemo(() => {
    const raw = [...races].map(([uf, race]) => [uf, raceStatus(race)] as const);
    const colors = colorsForParties(raw.flatMap(([, s]) => (s.leader ? [s.leader.party] : [])));
    return new Map(
      raw.map(([uf, s]) => [
        uf,
        s.leader ? { ...s, leader: { ...s.leader, color: colors.get(s.leader.party) ?? 0 } } : s,
      ]),
    );
  }, [races]);
  const inMap = [...statuses].filter(([uf]) => uf !== "zz");
  const settled = new Set(inMap.filter(([, s]) => isSettled(s.state)).map(([uf]) => uf));
  const count = (states: string[]) => inMap.filter(([, s]) => states.includes(s.state)).length;

  // Parties leading somewhere, with how many states.
  const leaders = new Map<string, { party: string; color: number; states: number }>();
  for (const [, s] of inMap) {
    if (!s.leader) continue;
    const cur = leaders.get(s.leader.party) ?? {
      party: s.leader.party,
      color: s.leader.color,
      states: 0,
    };
    cur.states++;
    leaders.set(s.leader.party, cur);
  }
  const legend = [...leaders.values()].sort((a, b) => b.states - a.states);

  const summary =
    office === "Presidente"
      ? null
      : office === "Governador"
        ? [
            [count(["eleito"]), count(["eleito"]) === 1 ? "eleito" : "eleitos"],
            [count(["segundo-turno"]), "com 2º turno"],
            [count(["tende-segundo-turno"]), "tendem ao 2º turno"],
            [count(["tende-vencer", "lidera", "disputa", "parcial", "aguardando"]), "em disputa"],
          ]
        : [
            [
              inMap.reduce((n, [, s]) => n + s.decided.length, 0),
              `de ${inMap.length * 2} vagas definidas`,
            ],
            [count(["eleito"]), "estados com as duas vagas definidas"],
          ];

  const nationalCall = national ? trendsFor(national.br, national.ufs).call.text : null;

  return (
    <>
      <div className="border-b border-border px-3 pb-3 pt-3">
        {nationalCall && (
          <div className="mb-2 rounded-sm border border-border bg-muted/40 px-2.5 py-1.5 text-[12px] font-semibold">
            {nationalCall}
          </div>
        )}
        {summary && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
            {summary
              .filter(([n]) => n !== 0)
              .map(([n, label]) => (
                <span key={String(label)}>
                  <span className="tnum font-bold">{n}</span>{" "}
                  <span className="text-muted-foreground">{label}</span>
                </span>
              ))}
          </div>
        )}
        {office === "Presidente" && (
          <p className="text-[12px] text-muted-foreground">
            Quem lidera em cada estado. Presidente é decidido no país todo, então aqui ninguém é
            eleito por estado.
          </p>
        )}
      </div>

      <div className="border-b border-border pb-3">
        <SectionTitle>Quem lidera em cada estado</SectionTitle>
        <StateMap
          ariaLabel={`Mapa do Brasil com quem lidera para ${office.toLowerCase()} em cada estado`}
          fillOf={(uf) => {
            const s = statuses.get(uf);
            return s ? leaderFill(s) : "var(--muted)";
          }}
          checks={office === "Presidente" ? undefined : settled}
          describe={(uf) => {
            const s = statuses.get(uf);
            if (!s?.leader)
              return <span className="text-muted-foreground">{ufLabel(uf)}: aguardando</span>;
            return (
              <>
                <span className="font-semibold">{ufLabel(uf)}</span> {s.leader.name} (
                {s.leader.party}) <span className="tnum">{pct(s.leader.share)}%</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {pct(s.progress)}% apurado
                  {office !== "Presidente" && ` · ${STATE_LABEL[s.state]}`}
                </span>
              </>
            );
          }}
        />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-muted-foreground">
          {legend.map((l) => (
            <span key={l.party} className="flex items-center gap-1">
              <span className="size-2" style={{ background: partyColor(l.color) }} />
              {l.party} <span className="tnum font-semibold text-foreground">{l.states}</span>
            </span>
          ))}
        </div>
        <p className="mt-1.5 px-3 text-[10px] text-muted-foreground">
          Cor mais forte = mais apurado.
          {office !== "Presidente" && " ✓ = resultado definido."}
        </p>
      </div>

      <div className="pb-3">
        <SectionTitle>Estado por estado</SectionTitle>
        <div className="mt-2 space-y-1.5 px-3">
          {[...statuses]
            .sort(([a], [b]) => (a === "zz" ? 1 : b === "zz" ? -1 : a.localeCompare(b)))
            .map(([uf, s]) => (
              <StateRow key={uf} uf={uf} status={s} office={office} />
            ))}
        </div>
      </div>
    </>
  );
}

function StateRow({
  uf,
  status: s,
  office,
}: {
  uf: string;
  status: RaceStatus;
  office: "Presidente" | "Governador" | "Senador";
}) {
  const settled = isSettled(s.state) || s.state === "parcial";
  const showState = office !== "Presidente";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 shrink-0 font-semibold">{ufLabel(uf)}</span>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: s.leader ? partyColor(s.leader.color) : "var(--muted)" }}
      />
      <span className="min-w-0 flex-1 truncate">
        {s.leader ? (
          <>
            {s.state === "eleito" || s.state === "parcial" ? s.decided.join(" e ") : s.leader.name}{" "}
            <span className="text-muted-foreground">{s.leader.party}</span>
          </>
        ) : (
          <span className="text-muted-foreground">aguardando</span>
        )}
      </span>
      {s.leader && <span className="tnum w-11 text-right">{pct(s.leader.share)}%</span>}
      {showState && (
        <span
          className={`w-[92px] shrink-0 text-right ${
            settled ? "font-semibold text-[var(--party-4)]" : "text-muted-foreground"
          }`}
        >
          {STATE_LABEL[s.state]}
        </span>
      )}
    </div>
  );
}

function Regions({ byUf }: { byUf: Map<string, Race> }) {
  const rows = REGIONS.map((r) => {
    const races = r.ufs.map((uf) => byUf.get(uf)).filter((x): x is Race => !!x);
    const done = races.reduce((n, x) => n + x.data.sections, 0);
    const total = races.reduce((n, x) => n + x.data.sectionsTotal, 0);
    return { name: r.name, progress: total > 0 ? (done / total) * 100 : 0 };
  });
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Por região</SectionTitle>
      <div className="mt-2 space-y-1.5 px-3">
        {rows.map((r) => (
          <Bar key={r.name} label={r.name} progress={r.progress} />
        ))}
      </div>
    </div>
  );
}

function Ranking({ ufRaces }: { ufRaces: Race[] }) {
  const rows = ufRaces
    .map((r) => ({ label: ufLabel(r.meta.abr), progress: r.data.progress }))
    .sort((a, b) => b.progress - a.progress || a.label.localeCompare(b.label));
  return (
    <div className="pb-3">
      <SectionTitle>Por estado, do mais ao menos apurado</SectionTitle>
      <div className="mt-2 space-y-1 px-3">
        {rows.map((r) => (
          <Bar key={r.label} label={r.label} progress={r.progress} />
        ))}
      </div>
    </div>
  );
}

function Bar({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 shrink-0 truncate">{label}</span>
      <div className="h-1.5 flex-1 bg-muted">
        <div
          className="h-full transition-[width] duration-700"
          style={{ width: `${progress}%`, background: progressFill(Math.max(progress, 40)) }}
        />
      </div>
      <span className="tnum w-14 text-right font-semibold">{pct(progress, 2)}%</span>
    </div>
  );
}

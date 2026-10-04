import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, X } from "lucide-react";
import { fmtFull, turnoutPct, useColumn, type Race } from "@/lib/election/live";
import { BRAZIL_PATHS, BRAZIL_VIEWBOX } from "./brazil-map.gen";
import { Tip } from "./Tip";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

// Sequential scale, one hue: from the muted surface (nothing counted) to the primary (all).
// Square root so early-count differences (most states under 30%) are visible; the legend
// samples the same function, so it stays truthful.
const fill = (progress: number) =>
  `color-mix(in oklch, var(--primary) ${Math.round(12 + Math.sqrt(progress / 100) * 88)}%, var(--muted))`;

const REGIONS: { name: string; ufs: string[] }[] = [
  { name: "Norte", ufs: ["ac", "am", "ap", "pa", "ro", "rr", "to"] },
  { name: "Nordeste", ufs: ["al", "ba", "ce", "ma", "pb", "pe", "pi", "rn", "se"] },
  { name: "Centro-Oeste", ufs: ["df", "go", "ms", "mt"] },
  { name: "Sudeste", ufs: ["es", "mg", "rj", "sp"] },
  { name: "Sul", ufs: ["pr", "rs", "sc"] },
];

type Props = {
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
};

// Overview of the count: national progress, a map of how much each state has counted,
// regions and a per-state ranking. Built from the Presidente files (same ballot boxes).
export function StatusColumn({ onRemove, onMove, isFirst, isLast }: Props) {
  const column = useColumn("br");
  const br = column.races.get(1);
  const byUf = new Map(column.ufRaces.map((r) => [r.meta.abr, r]));

  return (
    <section
      id="col-status"
      className="flex h-full w-[340px] shrink-0 animate-col-in flex-col border-r border-border bg-card"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 pb-2 pt-3">
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
      </header>

      <div className="flex-1 overflow-y-auto">
        {!br ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Carregando dados do TSE...
          </p>
        ) : (
          <>
            <National br={br} />
            <MapSection byUf={byUf} />
            <Regions byUf={byUf} />
            <Ranking ufRaces={column.ufRaces} />
          </>
        )}
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
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

function MapSection({ byUf }: { byUf: Map<string, Race> }) {
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? byUf.get(hover) : undefined;
  const abroad = byUf.get("zz");
  return (
    <div className="border-b border-border pb-3">
      <SectionTitle>Onde já foi apurado</SectionTitle>
      <div className="relative px-3 pt-2">
        <svg
          viewBox={BRAZIL_VIEWBOX}
          className="w-full"
          role="img"
          aria-label="Mapa do Brasil com o percentual apurado em cada estado"
        >
          {Object.entries(BRAZIL_PATHS).map(([uf, d]) => {
            const progress = byUf.get(uf)?.data.progress ?? 0;
            return (
              <path
                key={uf}
                d={d}
                fill={fill(progress)}
                stroke="var(--card)"
                strokeWidth={hover === uf ? 1.6 : 0.6}
                strokeLinejoin="round"
                onMouseEnter={() => setHover(uf)}
                onMouseLeave={() => setHover((h) => (h === uf ? null : h))}
                className="cursor-default transition-[fill] duration-700"
              >
                <title>{`${uf.toUpperCase()}: ${pct(progress, 2)}% apurado`}</title>
              </path>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 rounded-sm bg-popover/90 px-2 py-1 text-[11px] shadow-sm">
          {hovered ? (
            <>
              <span className="font-semibold">{hovered.meta.abr.toUpperCase()}</span>{" "}
              <span className="tnum">{pct(hovered.data.progress, 2)}% apurado</span>
            </>
          ) : (
            <span className="text-muted-foreground">Passe o mouse num estado</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 px-3 text-[10px] text-muted-foreground">
        <span>0%</span>
        <span
          className="h-1.5 flex-1"
          style={{
            background: `linear-gradient(to right, ${[0, 10, 25, 50, 75, 100].map((p) => `${fill(p)} ${p}%`).join(", ")})`,
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
    .map((r) => ({
      label: r.meta.abr === "zz" ? "Exterior" : r.meta.abr.toUpperCase(),
      progress: r.data.progress,
    }))
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
          style={{ width: `${progress}%`, background: fill(Math.max(progress, 40)) }}
        />
      </div>
      <span className="tnum w-14 text-right font-semibold">{pct(progress, 2)}%</span>
    </div>
  );
}

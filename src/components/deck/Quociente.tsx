import { useMemo, useState } from "react";
import { distributeSeats, qeInputFor, type Place, type Race } from "@/lib/election/live";
import { Tip } from "./Tip";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number) => n.toFixed(0);

type Row = {
  qp: number;
  id: string;
  label: string;
  votes: number;
  byQp: number;
  byRemainder: number;
  seats: number;
};

export function Quociente({ race, place }: { race: Race; place: Place }) {
  const [all, setAll] = useState(false);
  const { meta, data } = race;

  const result = useMemo(() => {
    if (place.kind !== "uf" || !meta.groups?.length || data.valid === 0) return null;
    return distributeSeats(qeInputFor(meta, data));
  }, [place.kind, meta, data]);

  if (place.kind !== "uf")
    return (
      <Section badge={false}>
        <p className="px-3 pt-1 text-xs text-muted-foreground">
          As vagas de deputado federal são distribuídas por estado. Abra a coluna do estado (
          {place.uf}) para ver a simulação do quociente eleitoral.
        </p>
      </Section>
    );

  if (!meta.groups?.length)
    return (
      <Section>
        <p className="px-3 pt-1 text-xs text-muted-foreground">
          Carregando partidos e federações desta disputa...
        </p>
      </Section>
    );

  if (!result)
    return (
      <Section>
        <p className="px-3 pt-1 text-xs text-muted-foreground">
          A simulação começa com as primeiras seções totalizadas. {meta.seats} vagas em disputa.
        </p>
      </Section>
    );

  // Once the TSE publishes the distribution, show it instead of our simulation.
  const official = data.official ? new Map(data.official.seats) : null;
  const qe = data.official?.qe ?? result.qe;
  const rows: Row[] = result.groups
    .map((g) => {
      const seats = official ? (official.get(g.id) ?? 0) : g.seats;
      return { ...g, seats };
    })
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
  const shown = all ? rows : rows.filter((r) => r.seats > 0 || r.votes >= 0.8 * qe).slice(0, 12);
  const hidden = rows.length - shown.length;

  return (
    <Section official={!!official}>
      <div className="mt-1 flex justify-between px-3 text-[11px] text-muted-foreground">
        <span>
          QE <span className="tnum font-semibold text-foreground">{nf.format(qe)}</span> votos
        </span>
        <span>
          <span className="tnum font-semibold text-foreground">{meta.seats}</span> vagas
        </span>
      </div>
      {result.noGroupReachedQe && !official && (
        <p className="mx-3 mt-2 rounded-sm border border-border bg-muted/40 px-2 py-1 text-[11px]">
          Nenhuma agremiação atinge o QE: as vagas vão aos candidatos mais votados (art. 111).
        </p>
      )}
      <div className="mt-2 space-y-1 px-3">
        <div className="flex text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="flex-1">Partido ou federação</span>
          <span className="w-[72px] text-right">Votos</span>
          <span className="w-[44px] text-right">% QE</span>
          <span className="w-[44px] text-right">Vagas</span>
        </div>
        {shown.map((r) => (
          <div key={r.id} className="flex items-center text-[12px]">
            <span
              className={`min-w-0 flex-1 truncate ${r.seats > 0 ? "font-medium" : "text-muted-foreground"}`}
            >
              {r.label}
            </span>
            <span className="tnum w-[72px] text-right text-muted-foreground">
              {nf.format(r.votes)}
            </span>
            <span className="tnum w-[44px] text-right text-muted-foreground">
              {pct((r.votes / qe) * 100)}%
            </span>
            {official ? (
              <span className="tnum w-[44px] text-right font-semibold">{r.seats}</span>
            ) : (
              <Tip label={seatsReason(r)}>
                <span className="tnum w-[44px] text-right font-semibold">{r.seats}</span>
              </Tip>
            )}
          </div>
        ))}
        {(hidden > 0 || all) && (
          <button
            onClick={() => setAll((v) => !v)}
            className="pt-1 text-[11px] font-semibold text-primary hover:underline"
          >
            {all ? "Mostrar menos" : `Mostrar todos (${rows.length})`}
          </button>
        )}
      </div>
      <p className="px-3 pt-2 text-[11px] leading-snug text-muted-foreground">
        {official
          ? "Distribuição oficial publicada pelo TSE."
          : "Simulação com os votos já apurados, pelas regras dos arts. 106 a 111 do Código Eleitoral. Muda conforme a apuração avança e não substitui o resultado oficial do TSE."}
      </p>
    </Section>
  );
}

function seatsReason(r: Row) {
  const base = `${r.byQp} pelo quociente partidário + ${r.byRemainder} pelas sobras`;
  const unfilled = r.qp - r.byQp;
  return unfilled > 0
    ? `${base}. ${unfilled} vaga(s) do quociente partidário sem candidato com 10% do QE (art. 108).`
    : base;
}

function Section({
  children,
  official,
  badge = true,
}: {
  children: React.ReactNode;
  official?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="border-b border-border pb-3">
      <h3 className="flex items-center gap-1.5 px-3 pt-3 text-xs font-bold text-muted-foreground">
        Quociente eleitoral
        {badge && (
          <span
            className={`rounded-sm border px-1 text-[10px] font-semibold ${official ? "border-[var(--party-4)] text-[var(--party-4)]" : "border-border"}`}
          >
            {official ? "oficial" : "simulação"}
          </span>
        )}
      </h3>
      {children}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import {
  candidatePhoto,
  displayName,
  distributeSeats,
  isProportional,
  qeInputFor,
  trendPath,
  trendsFor,
  pointValidOf,
  validOf,
  voteStatusOf,
  type Place,
  type Race,
} from "@/lib/election/live";
import { ResultBadge } from "./ResultBadge";
import { VoteStatusBadge } from "./VoteStatusBadge";

const nf = new Intl.NumberFormat("pt-BR");
const pct = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
const partyColor = (c: number) => `var(--party-${c})`;

function ageOn(born: string, today = new Date()) {
  const [y, m, d] = born.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

const bornLabel = (born: string) => born.split("-").reverse().join("/");

type Props = {
  race: Race;
  place: Place;
  ufRaces: Race[];
  candidateId: string;
  onBack: () => void;
};

export function CandidateDetail({ race, place, ufRaces, candidateId, onBack }: Props) {
  const { meta, data, history } = race;
  const c = meta.candidates.find((x) => x.id === candidateId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const ranked = useMemo(
    () => [...data.votes].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i] as const),
    [data.votes],
  );
  if (!c) {
    return (
      <Shell place={place} office={meta.office} onBack={onBack}>
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Candidato não encontrado nesta disputa.
        </p>
      </Shell>
    );
  }

  const tr = trendsFor(race, ufRaces);
  const row = data.votes.find((r) => r[0] === c.id);
  const votes = row?.[1] ?? 0;
  const status = row?.[2] ?? "";
  const valid = validOf(data);
  const share = valid > 0 ? (votes / valid) * 100 : 0;
  const position = (new Map(ranked).get(c.id) ?? 0) + 1;
  const started = data.progress > 0;
  const proportional = isProportional(meta.cargo);
  const color = proportional ? "var(--muted-foreground)" : partyColor(race.colors[c.id] ?? 0);
  const age = c.born ? ageOn(c.born) : null;

  return (
    <Shell place={place} office={meta.office} onBack={onBack}>
      <div className="flex flex-col items-center px-3 pb-4 pt-5 text-center">
        <Photo race={race} id={c.id} name={displayName(c.name)} color={color} />
        <h2 className="mt-3 text-lg font-bold leading-tight">{displayName(c.name)}</h2>
        {c.fullName && (
          <p className="mt-0.5 text-xs text-muted-foreground">{displayName(c.fullName)}</p>
        )}
        <p className="mt-2 text-xs">
          <span className="font-semibold">{c.party}</span>
          <span className="text-muted-foreground"> · número {c.number}</span>
        </p>
        {c.partyName && (
          <p className="text-[11px] text-muted-foreground">{displayName(c.partyName)}</p>
        )}
        {status ? (
          <StatusBadge status={status} />
        ) : (
          <ResultBadge
            status=""
            decided={tr.decided.includes(c.id)}
            runoff={tr.inRunoff.includes(c.id)}
            large
          />
        )}
        <VoteStatusBadge status={voteStatusOf(data, c.id)} large />
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-border bg-border">
        <Stat label="Votos" value={nf.format(votes)} />
        <Stat label="% dos válidos" value={`${pct(share)}%`} />
        <Stat label="Posição" value={started ? `${position}º de ${meta.candidates.length}` : "-"} />
        {proportional ? (
          <ProportionalStat race={race} place={place} candidateId={c.id} />
        ) : (
          <TrendStat race={race} ufRaces={ufRaces} candidateId={c.id} />
        )}
      </div>

      <Section title="Perfil">
        <dl className="space-y-1.5 px-3 text-xs">
          {age !== null && (
            <Item label="Idade" value={`${age} anos (nascimento em ${bornLabel(c.born)})`} />
          )}
          {c.coalition ? (
            <Item
              label="Coligação"
              value={`${displayName(c.coalition.name)}${c.coalition.parties ? ` (${c.coalition.parties})` : ""}`}
            />
          ) : (
            meta.groups
              ?.filter((g) => g.id === c.group && g.federation)
              .map((g) => <Item key={g.id} label="Federação" value={g.label} />)
          )}
          {c.mates?.map((m) => (
            <Item
              key={m.role + m.name}
              label={m.role}
              value={`${displayName(m.name)}${m.party ? ` (${m.party})` : ""}`}
            />
          ))}
        </dl>
      </Section>

      <Evolution race={race} ufRaces={ufRaces} candidateId={c.id} color={color} />

      {meta.abr === "br" && ufRaces.length > 0 && (
        <ByState ufRaces={ufRaces} candidateId={c.id} color={color} />
      )}
    </Shell>
  );
}

function Shell({
  place,
  office,
  onBack,
  children,
}: {
  place: Place;
  office: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-1.5 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-semibold text-primary hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
          Voltar
        </button>
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {place.name} · {office}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto animate-fade-in">{children}</div>
    </>
  );
}

function Photo({ race, id, name, color }: { race: Race; id: string; name: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="relative grid size-24 place-items-center overflow-hidden rounded-full text-2xl font-bold text-primary-foreground"
      style={{ background: color, boxShadow: `0 0 0 3px ${color}` }}
    >
      {initials}
      {!failed && (
        <img
          src={candidatePhoto(race.meta, id)}
          alt={`Foto de ${name}`}
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const elected = /^eleit/i.test(status);
  return (
    <span
      className={`mt-2 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${elected ? "border-[var(--party-4)] text-[var(--party-4)]" : "border-border text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tnum mt-0.5 text-[15px] font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function TrendStat({
  race,
  ufRaces,
  candidateId,
}: {
  race: Race;
  ufRaces: Race[];
  candidateId: string;
}) {
  const tr = trendsFor(race, ufRaces);
  const t = tr.items.find((i) => i.id === candidateId);
  if (!t || race.data.progress === 0) return <Stat label="Projeção" value="-" />;
  return (
    <Stat
      label="Projeção"
      value={`${pct(t.projected, 1)}%`}
      hint={`${tr.winLabel}: ${tr.decided.includes(candidateId) ? "100" : t.win > 0.994 ? ">99" : Math.round(t.win * 100)}%`}
    />
  );
}

function ProportionalStat({
  race,
  place,
  candidateId,
}: {
  race: Race;
  place: Place;
  candidateId: string;
}) {
  const { meta, data } = race;
  if (place.kind !== "uf" || !meta.groups?.length || data.valid === 0)
    return (
      <Stat
        label="Simulação"
        value="-"
        hint={place.kind === "uf" ? "Após as primeiras seções" : "Calculada na coluna do estado"}
      />
    );
  const res = distributeSeats(qeInputFor(meta, data));
  const group = res.groups.find((g) => g.elected.includes(candidateId));
  const own = res.groups.find(
    (g) => meta.candidates.find((c) => c.id === candidateId)?.group === g.id,
  );
  return (
    <Stat
      label="Simulação"
      value={group ? "Eleito" : "Não eleito"}
      hint={own ? `${own.label}: ${own.seats} de ${meta.seats} vagas` : undefined}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-3">
      <h3 className="px-3 pb-2 pt-3 text-xs font-bold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function Evolution({
  race,
  ufRaces,
  candidateId,
  color,
}: {
  race: Race;
  ufRaces: Race[];
  candidateId: string;
  color: string;
}) {
  const { history, data } = race;
  const [showTrend, setShowTrend] = useState(false);
  const canTrend = data.progress > 0 && data.progress < 100;
  const real = history
    .filter((h) => h.valid > 0 && candidateId in h.votes)
    .map((h) => ({
      p: Math.round(h.progress * 10) / 10,
      v: ((h.votes[candidateId] ?? 0) / pointValidOf(h, data.blocked)) * 100,
    }));
  const trend =
    showTrend && canTrend
      ? trendPath(race, ufRaces).map((t) => ({
          p: Math.round(t.p * 10) / 10,
          t: t.shares.get(candidateId) ?? 0,
        }))
      : [];
  const points = [...real, ...trend].sort((a, b) => a.p - b.p);
  const final = trend.at(-1)?.t;
  return (
    <div className="border-b border-border pb-3">
      <div className="flex items-baseline justify-between px-3 pb-2 pt-3">
        <h3 className="text-xs font-bold text-muted-foreground">Evolução por % apurado</h3>
        {canTrend && real.length >= 2 && (
          <button
            onClick={() => setShowTrend((v) => !v)}
            aria-pressed={showTrend}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {showTrend ? "Ocultar tendência" : "Mostrar tendência"}
          </button>
        )}
      </div>
      {real.length < 2 ? (
        <p className="px-3 text-xs text-muted-foreground">
          {history.some((h) => h.valid > 0)
            ? "Sem histórico suficiente para este candidato ainda."
            : "O gráfico começa com as primeiras seções totalizadas."}
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
            formatter={(v: number, k: string) => [
              `${pct(v)}%`,
              k === "t" ? "Tendência" : "Votos válidos",
            ]}
          />
          <Line
            dataKey="v"
            dot={false}
            isAnimationActive={false}
            type="monotone"
            connectNulls
            strokeWidth={2}
            stroke={color}
          />
          {showTrend && (
            <Line
              dataKey="t"
              dot={false}
              isAnimationActive={false}
              type="monotone"
              connectNulls
              strokeWidth={1.75}
              strokeDasharray="4 3"
              stroke={color}
            />
          )}
        </LineChart>
      )}
      {showTrend && final !== undefined && (
        <p className="px-3 pt-1 text-[11px] leading-snug text-muted-foreground">
          Tracejado: tende a terminar com{" "}
          <span className="tnum font-semibold text-foreground">{pct(final, 1)}%</span>, estimado
          pelo jeito que os votos que faltam devem se dividir. É estimativa, não resultado.
        </p>
      )}
    </div>
  );
}

function ByState({
  ufRaces,
  candidateId,
  color,
}: {
  ufRaces: Race[];
  candidateId: string;
  color: string;
}) {
  const rows = ufRaces
    .map((r) => {
      const valid = validOf(r.data);
      const votes = r.data.votes.find((v) => v[0] === candidateId)?.[1] ?? 0;
      const leader = [...r.data.votes].sort((a, b) => b[1] - a[1])[0];
      return {
        uf: r.meta.abr === "zz" ? "Exterior" : r.meta.abr.toUpperCase(),
        votes,
        share: valid > 0 ? (votes / valid) * 100 : 0,
        leads: valid > 0 && leader?.[0] === candidateId,
      };
    })
    .sort((a, b) => b.share - a.share || a.uf.localeCompare(b.uf));
  const max = Math.max(1, ...rows.map((r) => r.share));
  if (ufRaces.every((r) => validOf(r.data) === 0))
    return (
      <Section title="Votos por estado">
        <p className="px-3 text-xs text-muted-foreground">
          Os votos por estado aparecem com as primeiras seções totalizadas.
        </p>
      </Section>
    );
  return (
    <Section title="Votos por estado">
      <div className="space-y-1 px-3">
        {rows.map((r) => (
          <div key={r.uf} className="flex items-center gap-2 text-[11px]">
            <span className={`w-14 shrink-0 ${r.leads ? "font-bold" : ""}`}>{r.uf}</span>
            <div className="h-1.5 flex-1 bg-muted">
              <div
                className="h-full"
                style={{ width: `${(r.share / max) * 100}%`, background: color }}
              />
            </div>
            <span className="tnum w-12 text-right font-semibold">{pct(r.share, 1)}%</span>
            <span className="tnum w-[68px] text-right text-muted-foreground">
              {nf.format(r.votes)}
            </span>
          </div>
        ))}
        <p className="pt-1 text-[10px] text-muted-foreground">
          Em negrito, os estados onde lidera.
        </p>
      </div>
    </Section>
  );
}

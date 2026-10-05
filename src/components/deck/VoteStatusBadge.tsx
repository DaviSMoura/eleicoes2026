import { Tip } from "./Tip";

// Candidates whose votes the TSE does not count as valid, labeled as the TSE app does.
const LABELS: [RegExp, string, string][] = [
  [
    /sub judice/i,
    "sub judice",
    "Candidatura sub judice: a Justiça Eleitoral ainda vai decidir se vale. Até lá os votos ficam anulados e não contam para eleger ninguém, mas o TSE mostra o percentual.",
  ],
  [
    /anulad/i,
    "anulado",
    "Votos anulados pela Justiça Eleitoral: não contam para eleger ninguém. O TSE ainda mostra o percentual.",
  ],
];

export function VoteStatusBadge({
  status,
  large,
}: {
  status: string | undefined;
  large?: boolean;
}) {
  const match = status ? LABELS.find(([re]) => re.test(status)) : undefined;
  if (!match) return null;
  const [, label, tip] = match;
  return (
    <Tip side="top" label={tip}>
      <span
        className={`shrink-0 rounded-sm border border-border font-semibold text-muted-foreground ${
          large ? "mt-2 px-1.5 py-0.5 text-[11px]" : "px-1 text-[10px]"
        }`}
      >
        {label}
      </span>
    </Tip>
  );
}

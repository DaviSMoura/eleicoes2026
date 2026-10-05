import { Tip } from "./Tip";

const MATH_ELECTED =
  "Matematicamente eleito: nem com todos os votos que faltam apurar os adversários alcançam. O TSE ainda não publicou o resultado final.";
const MATH_RUNOFF =
  "Matematicamente no 2º turno: ninguém consegue mais passar de 50% dos válidos, nem com todos os votos que faltam apurar, e no máximo um adversário ainda pode terminar à frente. O TSE ainda não publicou o resultado final.";

// "eleito" / "2º turno", from the TSE status or, before it, from the numbers (with why on hover).
export function ResultBadge({
  status,
  decided,
  runoff,
  large,
}: {
  status: string;
  decided?: boolean | undefined;
  runoff?: boolean | undefined;
  large?: boolean;
}) {
  const size = large ? "mt-2 px-1.5 py-0.5 text-[11px]" : "px-1 text-[10px]";
  const elected = /^eleit/i.test(status) || (!status && decided);
  const inRunoff = /2º turno/i.test(status) || (!status && runoff);
  if (!elected && !inRunoff) return null;
  const badge = elected ? (
    <span
      className={`shrink-0 rounded-sm border border-[var(--party-4)] font-semibold text-[var(--party-4)] ${size}`}
    >
      eleito
    </span>
  ) : (
    <span
      className={`shrink-0 rounded-sm border border-border font-semibold text-foreground ${size}`}
    >
      2º turno
    </span>
  );
  if (status) return badge;
  return (
    <Tip side="top" label={elected ? MATH_ELECTED : MATH_RUNOFF}>
      {badge}
    </Tip>
  );
}

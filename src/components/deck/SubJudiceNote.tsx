import { Scale } from "lucide-react";
import type { AnnulledScenario } from "@/lib/election/live";

const who = (names: string[]) =>
  names.length === 1
    ? `${names[0]} está sub judice`
    : names.length <= 3
      ? `${names.slice(0, -1).join(", ")} e ${names.at(-1)} estão sub judice`
      : `${names.length} candidatos estão sub judice`;

// Disclaimer on a race with candidates sub judice, with the switch to the scenario where their
// votes are annulled.
export function SubJudiceNote({
  scenario,
  on,
  onToggle,
}: {
  scenario: AnnulledScenario;
  on: boolean;
  onToggle: () => void;
}) {
  const many = scenario.names.length > 1;
  return (
    <div className="mx-3 mt-2 rounded border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug">
      <p className="flex gap-1.5">
        <Scale className="mt-px size-3.5 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-semibold">{who(scenario.names)}.</span>{" "}
          <span className="text-muted-foreground">
            O TSE conta {many ? "esses votos" : "os votos"} no percentual até a Justiça Eleitoral
            decidir. Se a candidatura for barrada, eles viram nulos.
          </span>
        </span>
      </p>
      {on && (
        <p className="mt-1.5 pl-5">
          {scenario.outcome && <span className="font-semibold">{scenario.outcome} </span>}
          <span className="text-muted-foreground">
            Percentuais só sobre os votos válidos, com os votos apurados até agora.
          </span>
        </p>
      )}
      <button
        onClick={onToggle}
        aria-pressed={on}
        className="mt-1.5 pl-5 font-semibold text-primary hover:underline"
      >
        {on
          ? "Voltar aos números do TSE"
          : `Ver como fica se ${many ? "forem anulados" : "for anulado"}`}
      </button>
    </div>
  );
}

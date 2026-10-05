import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AnnulledScenario } from "@/lib/election/live";

// One line on a race with candidates sub judice: who (expands to the why) and a switch to the
// scenario where their votes are annulled, with its effect on the result.
export function SubJudiceNote({
  scenario,
  on,
  onToggle,
}: {
  scenario: AnnulledScenario;
  on: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { names } = scenario;
  const many = names.length > 1;
  return (
    <div className="mx-3 mt-2 text-[11px] leading-snug">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">
            {many ? (
              <span className="font-semibold text-foreground">{names.length} candidatos</span>
            ) : (
              <span className="font-semibold text-foreground">{names[0]}</span>
            )}{" "}
            sub judice
          </span>
          <ChevronDown
            className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <button
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className="flex shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {many ? "se anulados" : "se anulado"}
          <span
            className={`relative h-3.5 w-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}
          >
            <span
              className={`absolute top-0.5 size-2.5 rounded-full bg-background shadow-sm transition-transform ${on ? "translate-x-3" : "translate-x-0.5"}`}
            />
          </span>
        </button>
      </div>
      {open && (
        <p className="mt-1 text-muted-foreground">
          {many && names.length <= 3 && <>{names.join(", ")}. </>}O TSE conta{" "}
          {many ? "esses votos" : "os votos"} no percentual até a Justiça Eleitoral julgar a
          candidatura. Se for barrada, eles viram nulos e saem da conta.
        </p>
      )}
      {on && scenario.outcome && <p className="mt-1 font-semibold">{scenario.outcome}</p>}
    </div>
  );
}

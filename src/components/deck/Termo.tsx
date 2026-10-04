import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function Termo() {
  return (
    <Dialog>
      <DialogTrigger className="shrink-0 underline-offset-2 hover:text-foreground hover:underline">
        Termo de responsabilidade
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Termo de responsabilidade</DialogTitle>
          <DialogDescription>Leia antes de usar as informações deste site.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            O Eleições2026 é um projeto independente, sem vínculo com o Tribunal Superior Eleitoral
            (TSE), com a Justiça Eleitoral, com partidos, federações, candidatos ou veículos de
            imprensa.
          </p>
          <p>
            Os resultados exibidos são obtidos dos arquivos públicos de divulgação do TSE
            (resultados.tse.jus.br). Eles podem chegar com atraso ou apresentar divergências
            temporárias em relação à fonte.
          </p>
          <p>
            Tendências, projeções, chances de vitória e a simulação do quociente eleitoral são
            estimativas calculadas por este site a partir dos votos já apurados. Não são resultados
            oficiais nem previsões garantidas e mudam conforme a apuração avança.
          </p>
          <p>
            O resultado oficial é exclusivamente o divulgado e proclamado pela Justiça Eleitoral.
            Para qualquer decisão, consulte o TSE.
          </p>
          <p>
            As informações são oferecidas no estado em que se encontram, sem garantia de exatidão,
            completude ou disponibilidade. O autor não se responsabiliza por decisões tomadas com
            base nelas.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

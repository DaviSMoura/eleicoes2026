import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Sun, Moon } from "lucide-react";
import { Logo } from "@/components/deck/Logo";
import { Tip } from "@/components/deck/Tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CityColumn } from "@/components/deck/CityColumn";
import {
  DEFAULT_PLACES,
  fmtTime,
  loadPlaces,
  useLiveStatus,
  type Place,
} from "@/lib/election/live";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Apuração 2026 — painel por cidade" },
      {
        name: "description",
        content:
          "Acompanhe a apuração das eleições 2026 lado a lado, cidade por cidade: presidente, governador, senador e deputados.",
      },
      { property: "og:title", content: "Apuração 2026 — painel por cidade" },
      {
        property: "og:description",
        content: "Colunas por cidade com placar, evolução, estados e atualizações da apuração.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Deck,
});

const KEY = "apuracao26:cols:v3";

function Deck() {
  const [cols, setCols] = useState<string[]>(DEFAULT_PLACES);
  const [places, setPlaces] = useState<Map<string, Place> | null>(null);
  const [adding, setAdding] = useState(false);
  const loaded = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [light, setLight] = useState(false);
  const live = useLiveStatus();

  useEffect(() => {
    setMounted(true);
    setLight(localStorage.getItem("apuracao26:theme") === "light");
    void loadPlaces().then((list) => setPlaces(new Map(list.map((p) => [p.id, p]))));
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    if (mounted) localStorage.setItem("apuracao26:theme", light ? "light" : "dark");
  }, [light, mounted]);

  useEffect(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(ids)) setCols(ids.filter((x): x is string => typeof x === "string"));
    } catch {
      // Storage indisponível ou valor corrompido: mantém as colunas padrão.
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) localStorage.setItem(KEY, JSON.stringify(cols));
  }, [cols]);

  const shown = useMemo(
    () => (places ? cols.map((id) => places.get(id)).filter((p): p is Place => !!p) : []),
    [cols, places],
  );

  const add = (id: string) => {
    setCols((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setAdding(false);
    setTimeout(
      () =>
        document.getElementById(`col-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "end" }),
      50,
    );
  };
  const remove = (id: string) => setCols((cur) => cur.filter((x) => x !== id));
  const move = (id: string, dir: -1 | 1) =>
    setCols((cur) => {
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      next[i] = cur[j]!;
      next[j] = id;
      return next;
    });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
          <Tip label="Apura26 · Eleições 2026">
            <span>
              <Logo className="mb-2 size-10" />
            </span>
          </Tip>
          <Tip label="Adicionar coluna">
            <button
              aria-label="Adicionar coluna"
              onClick={() => setAdding((v) => !v)}
              className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <Plus className="size-5" />
            </button>
          </Tip>
          <div className="my-2 h-px w-8 bg-sidebar-border" />
          <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {shown.map((p) => (
              <Tip key={p.id} label={`Ir para ${p.name}`}>
                <button
                  onClick={() =>
                    document
                      .getElementById(`col-${p.id}`)
                      ?.scrollIntoView({ behavior: "smooth", inline: "center" })
                  }
                  className="grid size-9 shrink-0 place-items-center rounded text-[11px] font-bold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  {p.kind === "uf" || p.kind === "br" ? p.uf : p.name.slice(0, 3).toUpperCase()}
                </button>
              </Tip>
            ))}
          </div>
          <Tip label={light ? "Mudar para modo escuro" : "Mudar para modo claro"}>
            <button
              aria-label={light ? "Modo escuro" : "Modo claro"}
              onClick={() => setLight((v) => !v)}
              className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
          </Tip>
          <Tip
            label={
              live.error
                ? `Sem conexão com o servidor: ${live.error}`
                : live.live
                  ? `Ao vivo · última atualização do TSE às ${fmtTime(live.lastTseAt) || "-"}`
                  : "Conectando..."
            }
          >
            <span className="mt-1 flex w-12 flex-col items-center gap-1 rounded-md py-1.5 text-muted-foreground">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase">
                <span
                  className={`size-1.5 rounded-full ${live.error ? "bg-muted-foreground" : live.live ? "bg-destructive animate-pulse" : "bg-muted-foreground animate-pulse"}`}
                />
                {live.live && !live.error ? "Ao vivo" : "..."}
              </span>
              <span className="tnum text-[11px] font-semibold">
                {fmtTime(live.lastTseAt) || "--:--"}
              </span>
            </span>
          </Tip>
        </aside>

        {adding && (
          <AddPanel places={places} existing={cols} onAdd={add} onClose={() => setAdding(false)} />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex flex-1 overflow-x-auto">
            {mounted &&
              shown.map((p, i) => (
                <CityColumn
                  key={p.id}
                  place={p}
                  isFirst={i === 0}
                  isLast={i === shown.length - 1}
                  onRemove={() => remove(p.id)}
                  onMove={(dir) => move(p.id, dir)}
                />
              ))}
            <button
              onClick={() => setAdding(true)}
              className="flex h-full w-[220px] shrink-0 flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
              <Plus className="size-6" />
              <span className="text-sm font-semibold">Adicionar coluna</span>
              {cols.length === 0 && (
                <span className="px-6 text-center text-xs">
                  Cada lugar vira uma coluna com a apuração ao vivo.
                </span>
              )}
            </button>
          </main>
          <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-sidebar px-3 text-[11px] text-muted-foreground">
            <span>
              Apura26 · fonte:{" "}
              <a
                href="https://resultados.tse.jus.br"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground"
              >
                TSE
              </a>
            </span>
            <a
              href="https://instagram.com/davimoura.dev"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              por <span className="font-semibold text-foreground">@davimoura.dev</span>
            </a>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}

const KIND_ORDER: Record<Place["kind"], number> = { br: 0, uf: 1, mun: 2, zz: 3 };

function AddPanel({
  places,
  existing,
  onAdd,
  onClose,
}: {
  places: Map<string, Place> | null;
  existing: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const list = useMemo(() => {
    if (!places) return [];
    const nq = norm(q.trim());
    const all = [...places.values()];
    const hits = nq
      ? all.filter((p) => norm(`${p.name} ${p.uf}`).includes(nq))
      : all.filter((p) => p.kind === "br" || p.kind === "uf");
    return hits
      .sort(
        (a, b) =>
          Number(!norm(a.name).startsWith(nq)) - Number(!norm(b.name).startsWith(nq)) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.name.localeCompare(b.name, "pt-BR"),
      )
      .slice(0, 100);
  }, [places, q]);
  const label = (p: Place) =>
    p.kind === "br" ? "País" : p.kind === "uf" ? "Estado" : p.kind === "zz" ? "Exterior" : p.uf;
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-border bg-popover animate-fade-in">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 className="text-[15px] font-bold">Adicionar coluna</h2>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Fechar
        </button>
      </div>
      <div className="border-b border-border p-3">
        <label className="flex items-center gap-2 rounded border border-input bg-background px-2 py-1.5 focus-within:border-primary">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && list[0] && !existing.includes(list[0].id)) onAdd(list[0].id);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Buscar estado ou município"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {!places && <li className="px-3 py-4 text-sm text-muted-foreground">Carregando...</li>}
        {list.map((p) => {
          const has = existing.includes(p.id);
          return (
            <li key={p.id}>
              <button
                disabled={has}
                onClick={() => onAdd(p.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40"
              >
                <span>
                  {p.name} <span className="text-muted-foreground">· {label(p)}</span>
                </span>
                <span className="text-xs text-muted-foreground">{has ? "aberta" : "+"}</span>
              </button>
            </li>
          );
        })}
        {places && list.length === 0 && (
          <li className="px-3 py-4 text-sm text-muted-foreground">Nada encontrado.</li>
        )}
      </ul>
    </div>
  );
}

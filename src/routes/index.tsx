import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { Plus, Pause, Play, Search } from "lucide-react";
import { CityColumn } from "@/components/deck/CityColumn";
import { CITIES, SIM_START, createCityState, fmtClock, tickCity, type CityState } from "@/lib/election/mock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Apuração 2026 — painel por cidade" },
      { name: "description", content: "Acompanhe a apuração das eleições 2026 lado a lado, cidade por cidade: presidente, governador, senador e deputados." },
      { property: "og:title", content: "Apuração 2026 — painel por cidade" },
      { property: "og:description", content: "Colunas por cidade com placar, evolução, zonas e atualizações da apuração." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Deck,
});

const DEFAULT = ["sao-paulo", "fortaleza", "belo-horizonte"];
const KEY = "apuracao26:cols";

type S = { cols: CityState[]; clock: number; paused: boolean };
type A =
  | { t: "add"; id: string }
  | { t: "remove"; id: string }
  | { t: "move"; id: string; dir: -1 | 1 }
  | { t: "tick" }
  | { t: "pause" }
  | { t: "restore"; ids: string[] };

function reducer(s: S, a: A): S {
  switch (a.t) {
    case "add": {
      if (s.cols.some((c) => c.id === a.id)) return s;
      const c = createCityState(a.id, s.clock);
      return c ? { ...s, cols: [...s.cols, c] } : s;
    }
    case "remove":
      return { ...s, cols: s.cols.filter((c) => c.id !== a.id) };
    case "move": {
      const i = s.cols.findIndex((c) => c.id === a.id);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= s.cols.length) return s;
      const cols = [...s.cols];
      const tmp = cols[i]!;
      cols[i] = cols[j]!;
      cols[j] = tmp;
      return { ...s, cols };
    }
    case "tick": {
      const clock = s.clock + 1;
      return { ...s, clock, cols: s.cols.map((c) => tickCity(c, clock)) };
    }
    case "pause":
      return { ...s, paused: !s.paused };
    case "restore":
      return { ...s, cols: a.ids.map((id) => createCityState(id, s.clock)).filter(Boolean) as CityState[] };
  }
}

function Deck() {
  const [s, dispatch] = useReducer(reducer, null, () => ({
    cols: DEFAULT.map((id) => createCityState(id)!),
    clock: SIM_START,
    paused: false,
  }));
  const [adding, setAdding] = useState(false);
  const loaded = useRef(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    try {
      const ids = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(ids)) dispatch({ t: "restore", ids });
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) localStorage.setItem(KEY, JSON.stringify(s.cols.map((c) => c.id)));
  }, [s.cols]);
  useEffect(() => {
    if (s.paused) return;
    const t = setInterval(() => dispatch({ t: "tick" }), 2500);
    return () => clearInterval(t);
  }, [s.paused]);

  const add = (id: string) => {
    dispatch({ t: "add", id });
    setAdding(false);
    setTimeout(() => document.getElementById(`col-${id}`)?.scrollIntoView({ behavior: "smooth", inline: "end" }), 50);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
        <div className="mb-2 grid size-9 place-items-center rounded bg-primary text-[13px] font-black text-primary-foreground">26</div>
        <button
          aria-label="Adicionar cidade"
          onClick={() => setAdding((v) => !v)}
          className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="size-5" />
        </button>
        <div className="my-2 h-px w-8 bg-sidebar-border" />
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
          {s.cols.map((c) => (
            <button
              key={c.id}
              title={c.city.name}
              onClick={() => document.getElementById(`col-${c.id}`)?.scrollIntoView({ behavior: "smooth", inline: "center" })}
              className="grid size-9 place-items-center rounded text-[11px] font-bold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              {c.city.name.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </div>
        <button
          aria-label={s.paused ? "Retomar" : "Pausar"}
          onClick={() => dispatch({ t: "pause" })}
          className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {s.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
        <div className="mt-1 text-center text-[10px] leading-tight text-muted-foreground">
          <span className={`mx-auto mb-1 block size-1.5 rounded-full ${s.paused ? "bg-muted-foreground" : "bg-destructive animate-pulse"}`} />
          <span className="tnum">{fmtClock(s.clock)}</span>
        </div>
      </aside>

      {adding && <AddPanel existing={s.cols.map((c) => c.id)} onAdd={add} onClose={() => setAdding(false)} />}

      <main className="flex flex-1 overflow-x-auto">
        {mounted && s.cols.map((c, i) => (
          <CityColumn
            key={c.id}
            state={c}
            isFirst={i === 0}
            isLast={i === s.cols.length - 1}
            onRemove={() => dispatch({ t: "remove", id: c.id })}
            onMove={(dir) => dispatch({ t: "move", id: c.id, dir })}
          />
        ))}
        <button
          onClick={() => setAdding(true)}
          className="flex h-full w-[220px] shrink-0 flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <Plus className="size-6" />
          <span className="text-sm font-semibold">Adicionar cidade</span>
          {s.cols.length === 0 && <span className="px-6 text-center text-xs">Cada cidade vira uma coluna com a apuração ao vivo.</span>}
        </button>
      </main>
    </div>
  );
}

function AddPanel({ existing, onAdd, onClose }: { existing: string[]; onAdd: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const list = CITIES.filter((c) => norm(`${c.name} ${c.uf}`).includes(norm(q)));
  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-r border-border bg-popover animate-fade-in">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <h2 className="text-[15px] font-bold">Adicionar coluna</h2>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
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
            placeholder="Buscar município"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {list.map((c) => {
          const has = existing.includes(c.id);
          return (
            <li key={c.id}>
              <button
                disabled={has}
                onClick={() => onAdd(c.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40"
              >
                <span>
                  {c.name} <span className="text-muted-foreground">· {c.uf}</span>
                </span>
                <span className="text-xs text-muted-foreground">{has ? "aberta" : "+"}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nenhum município encontrado.</li>}
      </ul>
    </div>
  );
}

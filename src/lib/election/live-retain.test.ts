import { describe, expect, it, vi } from "vitest";

// The backend, recorded: every watch call and the history it asked for.
const calls: { keys: string[]; history: string[] }[] = [];
vi.mock("@/lib/supabase", () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      functions: {
        invoke: (_: string, { body }: { body: { keys: string[]; history: string[] } }) => {
          calls.push({ keys: body.keys, history: body.history });
          return Promise.resolve({ data: { races: {}, history: {} }, error: null });
        },
      },
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
    },
  };
});

const { retainForTest } = await import("./live");

describe("retain", () => {
  it("fetches the history of a race another view already loaded without it", () => {
    const key = "br-c0001-e006257";
    retainForTest([key], [], []); // the Status column: no history
    retainForTest([key], [key], []); // then the Brasil column, which charts it
    expect(calls.at(-1)).toEqual({ keys: [key], history: [key] });
  });
});

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

// TSE names come in upper case ("FLAVIO BOLSONARO"); show them like people write them.
export const displayName = (name: string) =>
  name
    .split(" ")
    .map((w, i) => {
      if (/^[IVX]+$/.test(w) && i > 0) return w;
      const lower = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("-");
    })
    .join(" ");

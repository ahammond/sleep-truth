/** Deterministic made-up hypnograms for fixtures. Not real data. */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A plausible night of `hours` as stage letters plus movement digits. */
export function synthNight(seed: number, hours: number): { stages: string; movement: string } {
  const rand = mulberry32(seed);
  const total = Math.round(hours * 120);
  let stages = "W".repeat(10 + Math.floor(rand() * 30));
  let cycle = 0;
  while (stages.length < total - 20) {
    const len = 170 + Math.floor(rand() * 50);
    const deep = Math.floor(len * Math.max(0, 0.32 - 0.1 * cycle) * (0.7 + rand() * 0.6));
    const rem = Math.floor(len * Math.min(0.45, 0.08 + 0.09 * cycle) * (0.7 + rand() * 0.6));
    const light = Math.max(10, len - deep - rem);
    stages += "L".repeat(Math.floor(light * 0.55)) + "D".repeat(deep) + "L".repeat(Math.ceil(light * 0.45)) + "R".repeat(rem);
    if (rand() < 0.6) stages += "W".repeat(2 + Math.floor(rand() * 8));
    cycle++;
  }
  stages = stages.slice(0, total - 10) + "W".repeat(10);
  let movement = "";
  for (const s of stages) {
    const r = rand();
    if (s === "W") movement += r < 0.5 ? "3" : r < 0.8 ? "2" : "1";
    else movement += r < 0.05 ? "1" : r < 0.07 ? "2" : "0";
  }
  return { stages, movement };
}

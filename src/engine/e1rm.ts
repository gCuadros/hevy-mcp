export interface RepSet {
  weightKg: number | null;
  reps: number | null;
}

export type E1rmFormula = "epley" | "brzycki";

/** Epley: 1RM = weight × (1 + reps/30). Standard for higher rep ranges. */
export function epley1Rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/** Brzycki: 1RM = weight × 36 / (37 - reps). Undefined at reps >= 37. */
export function brzycki1Rm(weightKg: number, reps: number): number {
  return weightKg * (36 / (37 - reps));
}

function estimate(weightKg: number, reps: number, formula: E1rmFormula): number {
  return formula === "epley" ? epley1Rm(weightKg, reps) : brzycki1Rm(weightKg, reps);
}

function isScoreable(set: RepSet): set is { weightKg: number; reps: number } {
  return set.weightKg !== null && set.weightKg > 0 && set.reps !== null && set.reps > 0;
}

/** The single set with the highest estimated 1RM among a session's sets, or null if none are scoreable. */
export function bestSetE1rm<T extends RepSet>(sets: T[], formula: E1rmFormula = "epley"): { set: T; e1rm: number } | null {
  let best: { set: T; e1rm: number } | null = null;
  for (const set of sets) {
    if (!isScoreable(set)) continue;
    const e1rm = estimate(set.weightKg, set.reps, formula);
    if (!best || e1rm > best.e1rm) best = { set, e1rm };
  }
  return best;
}

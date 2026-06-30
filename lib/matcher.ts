// Матчинг профиль → каталог. См. docs/matching-algorithm.md.
import { CATALOG } from "./catalog";
import type {
  CatalogQuery,
  Occupation,
  RiasecKey,
  UserProfile,
} from "./types";

const RIASEC_KEYS: RiasecKey[] = ["R", "I", "A", "S", "E", "C"];

const WEIGHTS = {
  riasec: 0.3,
  skills: 0.2,
  format: 0.2,
  income: 0.15,
  values: 0.1,
  demand: 0.05,
};

export interface ScoredOccupation {
  occupation: Occupation;
  score: number;
}

export function matchOccupations(
  profile: UserProfile,
  query?: CatalogQuery | null,
  n = 5
): ScoredOccupation[] {
  const scored = CATALOG.map((occ) => ({
    occupation: occ,
    score: score(occ, profile),
  })).sort((a, b) => b.score - a.score);

  return diversify(scored, n, query);
}

function score(occ: Occupation, profile: UserProfile): number {
  return (
    WEIGHTS.riasec * riasecSimilarity(profile, occ) +
    WEIGHTS.skills * 0 + // навыки как бонус; на MVP не штрафуем (см. ниже)
    WEIGHTS.format * formatMatch(profile, occ) +
    WEIGHTS.income * incomeFit(profile, occ) +
    WEIGHTS.values * 0 + // values overlap требует тегов occupation_values (Фаза 1)
    WEIGHTS.demand * demandBonus(occ)
  );
}

function riasecSimilarity(profile: UserProfile, occ: Occupation): number {
  const a = RIASEC_KEYS.map((k) => profile.riasec[k]);
  const b = RIASEC_KEYS.map((k) => occ.riasec_scores[k]);
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB); // 0..1
}

function formatMatch(profile: UserProfile, occ: Occupation): number {
  const wanted = profile.constraints.format ?? [];
  if (!wanted.length) return 0.5; // нет предпочтений — нейтрально
  let hits = 0;
  let total = 0;
  for (const w of wanted) {
    total++;
    if (
      occ.work_context.includes(w as any) ||
      occ.employment_modes.includes(w as any) ||
      (w === "solo_ok" && (occ.employment_modes.includes("freelance") || occ.employment_modes.includes("business")))
    ) {
      hits++;
    }
  }
  return total ? hits / total : 0.5;
}

function incomeFit(profile: UserProfile, occ: Occupation): number {
  const goal = profile.constraints.income_goal;
  const floor = profile.constraints.income_floor;
  if (goal == null && floor == null) return 0.5;
  const high = Math.max(...occ.income.map((i) => i.income_high), 0);
  if (goal != null && high >= goal) return 1.0;
  if (floor != null && high >= floor) return 0.6;
  return 0.2;
}

function demandBonus(occ: Occupation): number {
  return occ.demand_level === "high" ? 1 : occ.demand_level === "medium" ? 0.6 : 0.3;
}

// Разнообразие: не более 2 на доминирующий RIASEC-тип, и стараемся показать
// и наём, и своё дело.
function diversify(
  scored: ScoredOccupation[],
  n: number,
  _query?: CatalogQuery | null
): ScoredOccupation[] {
  const picks: ScoredOccupation[] = [];
  const perType = new Map<string, number>();
  let hasEmployee = false;
  let hasSelf = false;

  for (const s of scored) {
    if (picks.length >= n) break;
    const dom = dominantRiasec(s.occupation);
    if ((perType.get(dom) ?? 0) >= 2) continue;
    picks.push(s);
    perType.set(dom, (perType.get(dom) ?? 0) + 1);
    if (s.occupation.employment_modes.includes("employee")) hasEmployee = true;
    if (
      s.occupation.employment_modes.includes("freelance") ||
      s.occupation.employment_modes.includes("business")
    )
      hasSelf = true;
  }

  // Гарантия представительства найма и своего дела
  if (!hasEmployee) ensureMode(scored, picks, "employee", n);
  if (!hasSelf) ensureMode(scored, picks, "self", n);

  return picks.slice(0, n);
}

function ensureMode(
  scored: ScoredOccupation[],
  picks: ScoredOccupation[],
  kind: "employee" | "self",
  n: number
) {
  const has = (o: Occupation) =>
    kind === "employee"
      ? o.employment_modes.includes("employee")
      : o.employment_modes.includes("freelance") || o.employment_modes.includes("business");
  const candidate = scored.find((s) => has(s.occupation) && !picks.includes(s));
  if (candidate) {
    if (picks.length >= n) picks.pop();
    picks.push(candidate);
  }
}

function dominantRiasec(occ: Occupation): string {
  let best: RiasecKey = "R";
  let bestVal = -1;
  for (const k of RIASEC_KEYS) {
    if (occ.riasec_scores[k] > bestVal) {
      bestVal = occ.riasec_scores[k];
      best = k;
    }
  }
  return best;
}

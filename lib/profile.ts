// Слияние profile_patch в профиль сессии. См. docs/system-prompt.md §«Как бэкенд
// использует ответ».
import type {
  Hypothesis,
  KlimovKey,
  ProfilePatch,
  RiasecKey,
  SkillItem,
  UserProfile,
} from "./types";

const RIASEC_KEYS: RiasecKey[] = ["R", "I", "A", "S", "E", "C"];
const KLIMOV_KEYS: KlimovKey[] = ["tech", "human", "sign", "art", "nature"];

export function mergePatch(profile: UserProfile, patch: ProfilePatch): UserProfile {
  if (!patch) return profile;

  // context / constraints / big_five — перезаписываем заданные поля
  if (patch.context) profile.context = { ...profile.context, ...patch.context };
  if (patch.constraints)
    profile.constraints = { ...profile.constraints, ...patch.constraints };
  if (patch.big_five_signals)
    profile.big_five_signals = { ...profile.big_five_signals, ...patch.big_five_signals };

  // riasec/klimov — суммируем дельты
  if (patch.riasec_delta) {
    for (const k of RIASEC_KEYS) {
      const d = patch.riasec_delta[k];
      if (typeof d === "number") profile.riasec[k] = clamp(profile.riasec[k] + d, 0, 100);
    }
  }
  if (patch.klimov_delta) {
    for (const k of KLIMOV_KEYS) {
      const d = patch.klimov_delta[k];
      if (typeof d === "number") profile.klimov[k] = clamp(profile.klimov[k] + d, 0, 100);
    }
  }

  // массивы строк — дополняем уникально
  if (patch.interests) profile.interests = uniqStrings([...profile.interests, ...patch.interests]);
  if (patch.values) profile.values = uniqStrings([...profile.values, ...patch.values]);

  // навыки — дополняем/обновляем по имени
  if (patch.skills) profile.skills = mergeSkills(profile.skills, patch.skills);

  // гипотезы — дополняем/обновляем по title
  if (patch.hypotheses) profile.hypotheses = mergeHypotheses(profile.hypotheses, patch.hypotheses);

  return profile;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function uniqStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(s.trim());
    }
  }
  return out;
}

function mergeSkills(existing: SkillItem[], incoming: SkillItem[]): SkillItem[] {
  const byName = new Map<string, SkillItem>();
  for (const s of existing) byName.set(s.skill.toLowerCase(), s);
  for (const s of incoming) {
    const key = s.skill.toLowerCase();
    byName.set(key, { ...byName.get(key), ...s });
  }
  return Array.from(byName.values());
}

function mergeHypotheses(existing: Hypothesis[], incoming: Hypothesis[]): Hypothesis[] {
  const byTitle = new Map<string, Hypothesis>();
  for (const h of existing) byTitle.set(h.title.toLowerCase(), h);
  for (const h of incoming) {
    const key = h.title.toLowerCase();
    byTitle.set(key, { ...byTitle.get(key), ...h });
  }
  return Array.from(byTitle.values());
}

// Чек-лист готовности профиля к финалу (profile-extraction-rubric §7)
export function profileReadiness(profile: UserProfile): {
  ready: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const riasecTop = Math.max(...Object.values(profile.riasec));
  if (riasecTop < 3) reasons.push("слабый сигнал RIASEC");
  if (profile.skills.length < 1) reasons.push("нет навыков");
  if (profile.constraints.income_floor == null) reasons.push("нет income_floor");
  if (!profile.constraints.format?.length) reasons.push("нет формата");
  const alive = profile.hypotheses.filter((h) => h.status === "alive" || h.reaction === "positive");
  if (alive.length < 3) reasons.push("меньше 3 живых гипотез");
  return { ready: reasons.length === 0, reasons };
}

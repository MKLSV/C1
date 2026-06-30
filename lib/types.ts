// Типы профиля пользователя и каталога. См. docs/dialogue-script.md и
// docs/database-schema.md.

export type RiasecKey = "R" | "I" | "A" | "S" | "E" | "C";
export type KlimovKey = "tech" | "human" | "sign" | "art" | "nature";
export type EmploymentMode = "employee" | "freelance" | "business" | "hybrid";
export type WorkContext =
  | "remote" | "office" | "hands" | "with_people" | "solo" | "team";
export type DialogueMode = "quick" | "deep";
export type Stage =
  | "rapport" | "interests" | "skills" | "values"
  | "hypotheses" | "reality_check" | "business" | "wrapup";

export type RiasecScores = Record<RiasecKey, number>;
export type KlimovScores = Record<KlimovKey, number>;

export interface SkillItem {
  skill: string;
  evidence?: string;
  paid?: boolean;
  level?: "basic" | "confident" | "expert";
}

export interface Constraints {
  income_floor?: number;
  income_goal?: number;
  format?: string[]; // WorkContext | EmploymentMode
  risk_tolerance?: "low" | "medium" | "high";
  geo?: string;
  time_to_invest?: string;
}

export interface Hypothesis {
  occupation_slug?: string;
  title: string;
  employment_mode?: EmploymentMode;
  reaction?: "positive" | "interested_but" | "negative" | "pending";
  objection?: string;
  status?: "alive" | "dropped" | "final";
  rationale?: string;
  first_action?: string;
}

export interface UserProfile {
  context: {
    life_stage?: string;
    pain?: string;
    current_occupation?: string;
  };
  riasec: RiasecScores;
  klimov: KlimovScores;
  big_five_signals: Record<string, string>;
  interests: string[];
  skills: SkillItem[];
  values: string[];
  constraints: Constraints;
  hypotheses: Hypothesis[];
  answers_count: number;
  confidence: number;
}

// То, что возвращает LLM на каждый ход (контракт из docs/system-prompt.md)
export interface ProfilePatch {
  context?: Partial<UserProfile["context"]>;
  riasec_delta?: Partial<RiasecScores>;
  klimov_delta?: Partial<KlimovScores>;
  big_five_signals?: Record<string, string>;
  interests?: string[];
  skills?: SkillItem[];
  values?: string[];
  constraints?: Constraints;
  hypotheses?: Hypothesis[];
}

export interface CatalogQuery {
  riasec?: string;
  format?: string[];
  income_min?: number;
}

export interface TurnResponse {
  reply: string;
  stage: Stage;
  profile_patch: ProfilePatch;
  ready_to_finalize?: boolean;
  needs_catalog_query?: CatalogQuery | null;
}

// Каталог
export interface IncomeProfile {
  employment_mode: EmploymentMode;
  pay_model: string;
  currency: string;
  income_low: number;
  income_median: number;
  income_high: number;
  period: string;
}

export interface Occupation {
  slug: string;
  title: string;
  summary: string;
  day_in_life: string;
  riasec_code: string;
  riasec_scores: RiasecScores;
  klimov_type: KlimovKey;
  employment_modes: EmploymentMode[];
  work_context: WorkContext[];
  demand_level: "low" | "medium" | "high";
  income: IncomeProfile[];
  first_action?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConsentRecord {
  accepted: boolean;
  version: string;
  at: string;
}

export interface Session {
  id: string;
  mode: DialogueMode;
  stage: Stage;
  profile: UserProfile;
  messages: ChatMessage[];
  lastCatalogQuery?: CatalogQuery | null;
  finalized: boolean;
  consent: ConsentRecord;
  createdAt: string;
}

export function emptyProfile(): UserProfile {
  return {
    context: {},
    riasec: { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 },
    klimov: { tech: 0, human: 0, sign: 0, art: 0, nature: 0 },
    big_five_signals: {},
    interests: [],
    skills: [],
    values: [],
    constraints: {},
    hypotheses: [],
    answers_count: 0,
    confidence: 0,
  };
}

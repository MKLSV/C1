// Согласие на обработку персональных данных. См. docs/privacy-policy.md и
// plan/phase-5-accounts-privacy.md. Версионируется: при изменении политики
// поднимаем версию, чтобы фиксировать, на какую редакцию дано согласие.

export const CONSENT_VERSION = "2026-06-30";

export interface ConsentRecord {
  accepted: boolean;
  version: string;
  at: string; // ISO timestamp
}

export function makeConsent(accepted: boolean): ConsentRecord {
  return { accepted, version: CONSENT_VERSION, at: new Date().toISOString() };
}

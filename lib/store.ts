// Хранилище сессий. На MVP — in-memory; в проде заменяется на Supabase
// (таблицы sessions/messages, см. migrations/0001_init.sql).
import { emptyProfile, type ConsentRecord, type DialogueMode, type Session } from "./types";
import { randomUUID } from "crypto";

const sessions = new Map<string, Session>();

export function createSession(mode: DialogueMode, consent: ConsentRecord): Session {
  const session: Session = {
    id: randomUUID(),
    mode,
    stage: "rapport",
    profile: emptyProfile(),
    messages: [],
    lastCatalogQuery: null,
    finalized: false,
    consent,
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function saveSession(session: Session): void {
  sessions.set(session.id, session);
}

// Удаление данных сессии по запросу пользователя (право на удаление, 152-ФЗ/GDPR).
export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

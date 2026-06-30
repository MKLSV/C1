// Хранилище сессий. На MVP — in-memory; в проде заменяется на Supabase
// (таблицы sessions/messages, см. migrations/0001_init.sql).
import { emptyProfile, type DialogueMode, type Session } from "./types";
import { randomUUID } from "crypto";

const sessions = new Map<string, Session>();

export function createSession(mode: DialogueMode): Session {
  const session: Session = {
    id: randomUUID(),
    mode,
    stage: "rapport",
    profile: emptyProfile(),
    messages: [],
    lastCatalogQuery: null,
    finalized: false,
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

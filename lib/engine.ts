// Оркестрация одного хода диалога. См. docs/architecture.md §3.
import { callTurn } from "./claude";
import { matchOccupations } from "./matcher";
import { mergePatch } from "./profile";
import { detectCrisis, CRISIS_REPLY } from "./safety";
import {
  SYSTEM_PROMPT,
  catalogContext,
  modeInstruction,
  profileContext,
} from "./systemPrompt";
import type { Occupation, Session, TurnResponse } from "./types";

export interface TurnResult {
  reply: string;
  stage: string;
  finalized: boolean;
  recommendations?: Occupation[];
  crisis?: boolean;
}

const HISTORY_LIMIT = 24; // последних реплик в контекст

export async function runTurn(session: Session, userMessage: string): Promise<TurnResult> {
  // 1. Safety: кризисные сигналы — перехват до LLM
  if (detectCrisis(userMessage)) {
    session.messages.push({ role: "user", content: userMessage });
    session.messages.push({ role: "assistant", content: CRISIS_REPLY });
    return { reply: CRISIS_REPLY, stage: session.stage, finalized: false, crisis: true };
  }

  session.messages.push({ role: "user", content: userMessage });

  // 2. Если прошлый ход просил каталог — подобрать роли
  let catalogBlock = "";
  if (session.lastCatalogQuery) {
    const matched = matchOccupations(session.profile, session.lastCatalogQuery, 6).map(
      (m) => m.occupation
    );
    catalogBlock = catalogContext(matched);
  }

  // 3. Собрать контекст и вызвать LLM (с одним ретраем на невалидный JSON)
  const systemBlocks = [
    SYSTEM_PROMPT,
    modeInstruction(session.mode),
    profileContext(session.profile),
    catalogBlock,
  ];
  const history = session.messages.slice(-HISTORY_LIMIT);

  let turn: TurnResponse;
  try {
    turn = await callTurn({ systemBlocks, history });
  } catch (e) {
    try {
      turn = await callTurn({
        systemBlocks: [...systemBlocks, "ВАЖНО: верни строго валидный JSON по схеме, без пояснений."],
        history,
      });
    } catch (e2) {
      const fallback =
        "Извини, я немного запутался. Можешь повторить последнюю мысль другими словами?";
      session.messages.push({ role: "assistant", content: fallback });
      return { reply: fallback, stage: session.stage, finalized: false };
    }
  }

  // 4. Слить профиль, обновить сессию
  session.profile = mergePatch(session.profile, turn.profile_patch);
  session.profile.answers_count += 1;
  session.stage = turn.stage;
  session.lastCatalogQuery = turn.needs_catalog_query ?? null;
  session.messages.push({ role: "assistant", content: turn.reply });

  // 5. Финал
  let recommendations: Occupation[] | undefined;
  if (turn.ready_to_finalize) {
    session.finalized = true;
    recommendations = matchOccupations(session.profile, null, 5).map((m) => m.occupation);
  }

  return {
    reply: turn.reply,
    stage: turn.stage,
    finalized: session.finalized,
    recommendations,
  };
}

// Клиент Claude API: один ход диалога. См. docs/architecture.md.
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, TurnResponse } from "./types";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");
    client = new Anthropic({ apiKey });
  }
  return client;
}

interface CallArgs {
  systemBlocks: string[]; // несколько system-вставок (промпт, режим, профиль, каталог)
  history: ChatMessage[];
}

export async function callTurn({ systemBlocks, history }: CallArgs): Promise<TurnResponse> {
  const anthropic = getClient();

  const system = systemBlocks
    .filter(Boolean)
    .map((text, i) => ({
      type: "text" as const,
      text,
      // кэшируем главный промпт (первый блок) для экономии токенов
      ...(i === 0 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));

  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1800,
    temperature: 0.7,
    system,
    messages,
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseTurn(text);
}

// Парсинг JSON-ответа модели с устойчивостью к обёрткам.
export function parseTurn(text: string): TurnResponse {
  const json = extractJson(text);
  const parsed = JSON.parse(json);
  return {
    reply: String(parsed.reply ?? ""),
    stage: parsed.stage ?? "rapport",
    profile_patch: parsed.profile_patch ?? {},
    ready_to_finalize: Boolean(parsed.ready_to_finalize),
    needs_catalog_query: parsed.needs_catalog_query ?? null,
  };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  // срезаем markdown-обёртку ```json ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  // иначе берём от первой { до последней }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1) return trimmed.slice(first, last + 1);
  return trimmed;
}

// POST /api/session — создать новую сессию с выбранным режимом.
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/store";
import type { DialogueMode } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode: DialogueMode = body?.mode === "quick" ? "quick" : "deep";
  const session = createSession(mode);

  // Первая реплика бота — приветствие (без обращения к LLM, фиксированное).
  const greeting =
    mode === "quick"
      ? "Привет! Я Компас. Давай быстро — за пару минут — нащупаем, какое дело тебе по душе и на чём можно зарабатывать. Расскажи в двух словах: что тебя привело? Что сейчас не так с работой или выбором?"
      : "Привет! Я Компас. Мы спокойно поговорим, и я помогу понять, каким делом тебе было бы интересно заниматься — и на чём при этом можно зарабатывать. Это не тест с оценками, отвечай как есть, даже «не знаю» — это нормально. Для начала: что тебя привело? Что сейчас не так с работой или выбором?";

  session.messages.push({ role: "assistant", content: greeting });

  return NextResponse.json({ session_id: session.id, mode, reply: greeting });
}

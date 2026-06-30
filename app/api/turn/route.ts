// POST /api/turn — один ход диалога.
import { NextRequest, NextResponse } from "next/server";
import { runTurn } from "@/lib/engine";
import { getSession, saveSession } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = body?.session_id;
  const message = (body?.message ?? "").toString().trim();

  if (!sessionId) return NextResponse.json({ error: "session_id обязателен" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "message пустой" }, { status: 400 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "сессия не найдена" }, { status: 404 });
  if (session.finalized)
    return NextResponse.json({
      reply: "Мы уже подвели итоги. Если хочешь — начни новый разговор, и разберём заново.",
      stage: "wrapup",
      finalized: true,
    });

  try {
    const result = await runTurn(session, message);
    saveSession(session);
    return NextResponse.json({
      reply: result.reply,
      stage: result.stage,
      finalized: result.finalized,
      crisis: result.crisis ?? false,
      recommendations: result.recommendations ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Ошибка обработки хода", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

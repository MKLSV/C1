// DELETE /api/session/[id] — удаление данных сессии по запросу пользователя
// (право на удаление, 152-ФЗ/GDPR). См. docs/privacy-policy.md.
import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/store";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteSession(params.id);
  return NextResponse.json({ deleted: ok });
}

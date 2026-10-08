import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/app/presets/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const preset = await db.reportPreset.findUnique({ where: { id } });
  if (!preset) return notFound("Пресет не найден");
  if (preset.userId !== session.uid) return badRequest("Можно удалять только свои пресеты");
  await db.reportPreset.delete({ where: { id } });
  await audit(session, "DELETE", "preset", id, `Пресет: ${preset.name}`);
  return NextResponse.json({ ok: true });
}

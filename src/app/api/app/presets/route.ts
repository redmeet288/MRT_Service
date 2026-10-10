import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, requireAuth } from "@/lib/api-helpers";

// GET /api/app/presets — пресеты текущего пользователя
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const presets = await db.reportPreset.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(presets);
}

// POST /api/app/presets — сохранить пресет фильтров
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Укажите название пресета");
  const preset = await db.reportPreset.create({
    data: {
      userId: session.uid,
      name,
      reportKey: String(body?.reportKey ?? "examinations"),
      filtersJson: JSON.stringify(body?.filters ?? {}),
    },
  });
  await audit(session, "CREATE", "preset", preset.id, `Пресет: ${name}`);
  return NextResponse.json(preset, { status: 201 });
}

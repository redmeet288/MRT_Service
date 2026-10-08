import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth, requireMP } from "@/lib/api-helpers";

// GET /api/app/statuses
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const items = await db.cooperationStatus.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { doctors: true } } },
  });
  return NextResponse.json(items);
}

// POST /api/app/statuses
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Укажите название статуса");
  const dup = await db.cooperationStatus.findUnique({ where: { name } });
  if (dup) return badRequest("Такой статус уже существует");
  const item = await db.cooperationStatus.create({
    data: { name, color: body?.color ? String(body.color) : "#7692cb" },
  });
  await audit(session, "CREATE", "status", item.id, `Статус: ${name}`);
  return NextResponse.json(item, { status: 201 });
}

// DELETE /api/app/statuses?id=... — только МП
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const used = await db.doctor.findFirst({ where: { statusId: id } });
  if (used) return badRequest("Статус назначен врачам");
  const item = await db.cooperationStatus.delete({ where: { id } }).catch(() => null);
  if (!item) return notFound("Статус не найден");
  await audit(session, "DELETE", "status", id, `Статус: ${item.name}`);
  return NextResponse.json({ ok: true });
}

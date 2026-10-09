import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth, requireMP } from "@/lib/api-helpers";

// ============================================================
// Справочник «Специализация врача» (доработка 1.2).
// Используется в карточке НВ — множественный выбор позиций.
// ============================================================

// GET /api/app/specializations?q=&active=1
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q");
  const onlyActive = sp.get("active") === "1";
  const items = await db.specialization.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(onlyActive ? { isActive: true } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { doctors: true } } },
  });
  return NextResponse.json(items);
}

// POST /api/app/specializations
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Укажите название специализации");
  const dup = await db.specialization.findFirst({ where: { name } });
  if (dup) return badRequest("Такая специализация уже существует");
  const item = await db.specialization.create({ data: { name } });
  await audit(session, "CREATE", "specialization", item.id, `Специализация: ${name}`);
  return NextResponse.json(item, { status: 201 });
}

// PUT /api/app/specializations — редактирование
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const name = String(body?.name ?? "").trim();
  if (!id) return badRequest("Не указан id");
  if (!name) return badRequest("Укажите название специализации");
  const dup = await db.specialization.findFirst({ where: { name, NOT: { id } } });
  if (dup) return badRequest("Такая специализация уже существует");
  const item = await db.specialization
    .update({
      where: { id },
      data: {
        name,
        ...(body?.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    })
    .catch(() => null);
  if (!item) return notFound("Специализация не найдена");
  await audit(session, "UPDATE", "specialization", id, `Специализация: ${name}`);
  return NextResponse.json(item);
}

// DELETE /api/app/specializations?id=... — только МП.
// Если специализация привязана к НВ — деактивация вместо удаления.
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const used = await db.doctorSpecialization.findFirst({ where: { specializationId: id } });
  if (used) {
    const item = await db.specialization.update({ where: { id }, data: { isActive: false } });
    await audit(session, "UPDATE", "specialization", id, `Деактивирована: ${item.name}`);
    return NextResponse.json({ ok: true, deactivated: true });
  }
  const item = await db.specialization.delete({ where: { id } }).catch(() => null);
  if (!item) return notFound("Специализация не найдена");
  await audit(session, "DELETE", "specialization", id, `Специализация: ${item.name}`);
  return NextResponse.json({ ok: true });
}

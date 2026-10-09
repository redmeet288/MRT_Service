import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth, requireMP } from "@/lib/api-helpers";

// GET /api/app/nomenclature?q=&active=1
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const q = req.nextUrl.searchParams.get("q");
  const onlyActive = req.nextUrl.searchParams.get("active") === "1";
  const items = await db.nomenclature.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(onlyActive ? { isActive: true } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
}

// POST /api/app/nomenclature
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Укажите наименование");
  const category = String(body?.category ?? "").trim() || "Обследования";
  const dup = await db.nomenclature.findFirst({ where: { name, category } });
  if (dup) return badRequest("Такая позиция уже существует");
  const item = await db.nomenclature.create({ data: { name, category } });
  await audit(session, "CREATE", "nomenclature", item.id, `Номенклатура: ${name}`);
  return NextResponse.json(item, { status: 201 });
}

// DELETE /api/app/nomenclature?id=... — только МП.
// Позиция НЕ удаляется физически, а помечается на удаление (isActive=false):
// исключается из выпадающих списков, история заявок сохраняется.
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const item = await db.nomenclature
    .update({ where: { id }, data: { isActive: false } })
    .catch(() => null);
  if (!item) return notFound("Позиция не найдена");
  await audit(session, "DELETE", "nomenclature", id, `Номенклатура: ${item.name} — помечена на удаление`);
  return NextResponse.json({ ok: true, deactivated: true });
}

// PUT /api/app/nomenclature — редактирование позиции номенклатуры.
// Поддерживается частичное обновление: { id, isActive } — для восстановления
// из пометки на удаление без передачи остальных полей.
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return badRequest("Не указан id");

  // Частичный режим: только переключение пометки на удаление
  if (body?.name === undefined) {
    if (body?.isActive === undefined) return badRequest("Нет данных для обновления");
    const item = await db.nomenclature
      .update({ where: { id }, data: { isActive: Boolean(body.isActive) } })
      .catch(() => null);
    if (!item) return notFound("Позиция не найдена");
    await audit(
      session,
      "UPDATE",
      "nomenclature",
      id,
      body.isActive ? `Номенклатура: ${item.name} — возвращена в работу` : `Номенклатура: ${item.name} — помечена на удаление`
    );
    return NextResponse.json(item);
  }

  const name = String(body.name).trim();
  if (!name) return badRequest("Укажите наименование");
  const category = String(body?.category ?? "").trim() || "Обследования";
  const dup = await db.nomenclature.findFirst({ where: { name, category, NOT: { id } } });
  if (dup) return badRequest("Такая позиция уже существует");
  const item = await db.nomenclature
    .update({
      where: { id },
      data: {
        name,
        category,
        ...(body?.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    })
    .catch(() => null);
  if (!item) return notFound("Позиция не найдена");
  await audit(session, "UPDATE", "nomenclature", id, `Номенклатура: ${name}`);
  return NextResponse.json(item);
}

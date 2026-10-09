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

// DELETE /api/app/nomenclature?id=... — только МП
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const usedA = await db.request.findFirst({ where: { assignedId: id } });
  const usedD = await db.request.findFirst({ where: { doneId: id } });
  if (usedA || usedD) {
    const item = await db.nomenclature.update({ where: { id }, data: { isActive: false } });
    await audit(session, "UPDATE", "nomenclature", id, `Деактивирована: ${item.name}`);
    return NextResponse.json({ ok: true, deactivated: true });
  }
  const item = await db.nomenclature.delete({ where: { id } }).catch(() => null);
  if (!item) return notFound("Позиция не найдена");
  await audit(session, "DELETE", "nomenclature", id, `Номенклатура: ${item.name}`);
  return NextResponse.json({ ok: true });
}

// PUT /api/app/nomenclature — редактирование позиции номенклатуры
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const name = String(body?.name ?? "").trim();
  if (!id) return badRequest("Не указан id");
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

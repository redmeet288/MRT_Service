import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth, requireMP } from "@/lib/api-helpers";

// GET /api/app/lpus?cityId=&q=
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const cityId = req.nextUrl.searchParams.get("cityId");
  const q = req.nextUrl.searchParams.get("q");
  const lpus = await db.lpu.findMany({
    where: {
      ...(cityId ? { cityId } : {}),
      ...(q ? { name: { contains: q } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      city: true,
      _count: { select: { doctors: true, requests: true } },
    },
  });
  return NextResponse.json(lpus);
}

// POST /api/app/lpus
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const cityId = String(body?.cityId ?? "");
  if (!name || !cityId) return badRequest("Укажите название и город");
  const dup = await db.lpu.findFirst({ where: { name, cityId } });
  if (dup) return badRequest("Такое ЛПУ уже существует в этом городе");
  const lpu = await db.lpu.create({
    data: { name, cityId, address: body?.address ? String(body.address) : null },
  });
  await audit(session, "CREATE", "lpu", lpu.id, `ЛПУ: ${name}`);
  return NextResponse.json(lpu, { status: 201 });
}

// DELETE /api/app/lpus?id=... — только МП.
// ЛПУ НЕ удаляется физически, а помечается на удаление (isActive=false):
// исключается из выпадающих списков, история заявок сохраняется.
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const lpu = await db.lpu
    .update({ where: { id }, data: { isActive: false } })
    .catch(() => null);
  if (!lpu) return notFound("ЛПУ не найдено");
  await audit(session, "DELETE", "lpu", id, `ЛПУ: ${lpu.name} — помечено на удаление`);
  return NextResponse.json({ ok: true });
}

// PUT /api/app/lpus — редактирование ЛПУ.
// Поддерживается частичное обновление: { id, isActive } — для восстановления
// из пометки на удаление без передачи остальных полей.
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return badRequest("Не указан id");

  // Частичный режим: только переключение пометки на удаление
  if (body?.name === undefined && body?.cityId === undefined) {
    if (body?.isActive === undefined) return badRequest("Нет данных для обновления");
    const lpu = await db.lpu
      .update({ where: { id }, data: { isActive: Boolean(body.isActive) } })
      .catch(() => null);
    if (!lpu) return notFound("ЛПУ не найдено");
    await audit(
      session,
      "UPDATE",
      "lpu",
      id,
      body.isActive ? `ЛПУ: ${lpu.name} — возвращено в работу` : `ЛПУ: ${lpu.name} — помечено на удаление`
    );
    return NextResponse.json(lpu);
  }

  const name = String(body?.name ?? "").trim();
  const cityId = String(body?.cityId ?? "");
  if (!name || !cityId) return badRequest("Укажите название и город");
  const dup = await db.lpu.findFirst({ where: { name, cityId, NOT: { id } } });
  if (dup) return badRequest("Такое ЛПУ уже существует в этом городе");
  // Пометка на удаление / восстановление (доработка)
  const data: Record<string, unknown> = { name, cityId };
  if (body?.address !== undefined) {
    data.address = body.address ? String(body.address) : null;
  }
  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);
  const lpu = await db.lpu
    .update({
      where: { id },
      data,
    })
    .catch(() => null);
  if (!lpu) return notFound("ЛПУ не найдено");
  await audit(session, "UPDATE", "lpu", id, `ЛПУ: ${name}`);
  return NextResponse.json(lpu);
}

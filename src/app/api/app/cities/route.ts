import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireAuth, requireMP } from "@/lib/api-helpers";

// GET /api/app/cities — список городов
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const cities = await db.city.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { lpus: true, doctors: true } } },
  });
  return NextResponse.json(cities);
}

// POST /api/app/cities — создать город
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Укажите название города");
  const exists = await db.city.findUnique({ where: { name } });
  if (exists) return badRequest("Такой город уже существует");
  const city = await db.city.create({ data: { name } });
  await audit(session, "CREATE", "city", city.id, `Город: ${name}`);
  return NextResponse.json(city, { status: 201 });
}

// DELETE /api/app/cities?id=... — удаление (только МП)
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const used = await db.lpu.findFirst({ where: { cityId: id } });
  const usedDoc = await db.doctor.findFirst({ where: { cityId: id } });
  if (used || usedDoc) return badRequest("Город используется в ЛПУ или у врачей");
  const city = await db.city.delete({ where: { id } }).catch(() => null);
  if (!city) return badRequest("Город не найден");
  await audit(session, "DELETE", "city", id, `Город: ${city.name}`);
  return NextResponse.json({ ok: true });
}

// PUT /api/app/cities — редактирование города
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const name = String(body?.name ?? "").trim();
  if (!id) return badRequest("Не указан id");
  if (!name) return badRequest("Укажите название города");
  const dup = await db.city.findFirst({ where: { name, NOT: { id } } });
  if (dup) return badRequest("Такой город уже существует");
  const city = await db.city.update({ where: { id }, data: { name } }).catch(() => null);
  if (!city) return notFound("Город не найден");
  await audit(session, "UPDATE", "city", id, `Город: ${name}`);
  return NextResponse.json(city);
}

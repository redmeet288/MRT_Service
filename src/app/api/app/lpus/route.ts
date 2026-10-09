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

// DELETE /api/app/lpus?id=... — только МП
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Не указан id");
  const linked = await db.doctorLpu.findFirst({ where: { lpuId: id } });
  const reqLinked = await db.request.findFirst({ where: { lpuId: id } });
  if (linked || reqLinked) return badRequest("ЛПУ используется у врачей или в заявках");
  const lpu = await db.lpu.delete({ where: { id } }).catch(() => null);
  if (!lpu) return notFound("ЛПУ не найдено");
  await audit(session, "DELETE", "lpu", id, `ЛПУ: ${lpu.name}`);
  return NextResponse.json({ ok: true });
}

// PUT /api/app/lpus — редактирование ЛПУ
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  const name = String(body?.name ?? "").trim();
  const cityId = String(body?.cityId ?? "");
  if (!id) return badRequest("Не указан id");
  if (!name || !cityId) return badRequest("Укажите название и город");
  const dup = await db.lpu.findFirst({ where: { name, cityId, NOT: { id } } });
  if (dup) return badRequest("Такое ЛПУ уже существует в этом городе");
  const lpu = await db.lpu
    .update({
      where: { id },
      data: {
        name,
        cityId,
        ...(body?.address !== undefined
          ? { address: body.address ? String(body.address) : null }
          : {}),
      },
    })
    .catch(() => null);
  if (!lpu) return notFound("ЛПУ не найдено");
  await audit(session, "UPDATE", "lpu", id, `ЛПУ: ${name}`);
  return NextResponse.json(lpu);
}

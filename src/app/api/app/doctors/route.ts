import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, parseDate, requireAuth } from "@/lib/api-helpers";

// GET /api/app/doctors?q=&mpId=&lpuId=&statusId=&cityId=
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q");
  const mpId = sp.get("mpId");
  const lpuId = sp.get("lpuId");
  const statusId = sp.get("statusId");
  const cityId = sp.get("cityId");
  const doctors = await db.doctor.findMany({
    where: {
      ...(q ? { fullName: { contains: q } } : {}),
      ...(mpId ? { mpId } : {}),
      ...(statusId ? { statusId } : {}),
      ...(cityId ? { cityId } : {}),
      ...(lpuId ? { lpus: { some: { lpuId } } } : {}),
    },
    orderBy: { fullName: "asc" },
    include: {
      status: true,
      mp: { select: { id: true, name: true } },
      city: true,
      lpus: { include: { lpu: { include: { city: true } } } },
      specializations: { include: { specialization: true } },
      _count: { select: { requests: true, visits: true } },
    },
  });
  return NextResponse.json(doctors);
}

// POST /api/app/doctors — создание первичной карточки НВ (доступно и Оператору)
// МП не обязателен: оператор создает НВ только с ФИО, МП затем закрепит врача за собой
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const fullName = String(body?.fullName ?? "").trim();
  if (!fullName) return badRequest("Укажите ФИО врача");
  const mpId = body?.mpId ? String(body.mpId).trim() : null;
  if (mpId) {
    const mp = await db.user.findUnique({ where: { id: mpId } });
    if (!mp || mp.role !== "MP") return badRequest("Указанный пользователь не является МП");
  }

  const lpuIds: string[] = Array.isArray(body?.lpuIds) ? body.lpuIds : [];
  const specIds: string[] = Array.isArray(body?.specializationIds)
    ? body.specializationIds.map(String)
    : [];
  const doctor = await db.doctor.create({
    data: {
      fullName,
      phone: body?.phone ? String(body.phone) : null,
      birthDate: parseDate(body?.birthDate),
      statusId: body?.statusId ? String(body.statusId) : null,
      mpId,
      cityId: body?.cityId ? String(body.cityId) : null,
      comment: body?.comment ? String(body.comment) : null,
      // График работы НВ (доработка 1.2) — свободный текст, необязательно
      workSchedule: body?.workSchedule ? String(body.workSchedule) : null,
      // Задел под бонусную систему — приходит скрытым/неактивным на старте
      bonusType: body?.bonusType ? String(body.bonusType) : null,
      payoutDetails: body?.payoutDetails ? String(body.payoutDetails) : null,
      lpus: { create: lpuIds.map((lpuId) => ({ lpuId })) },
      specializations: { create: specIds.map((specializationId) => ({ specializationId })) },
    },
  });
  await audit(session, "CREATE", "doctor", doctor.id, `НВ: ${fullName}`);
  return NextResponse.json(doctor, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, parseDate, requireAuth, requireMP } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// GET /api/app/doctors/[id] — полная CRM-карточка: профиль, привязки, визиты, заявки
export async function GET(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const doctor = await db.doctor.findUnique({
    where: { id },
    include: {
      status: true,
      mp: { select: { id: true, name: true, role: true } },
      city: true,
      lpus: { include: { lpu: { include: { city: true } } } },
      visits: {
        orderBy: { date: "desc" },
        include: { lpu: true, mp: { select: { id: true, name: true } } },
      },
      requests: {
        orderBy: { date: "desc" },
        include: {
          lpu: { include: { city: true } },
          assigned: true,
          done: true,
        },
      },
    },
  });
  if (!doctor) return notFound("Врач не найден");
  return NextResponse.json(doctor);
}

// PUT /api/app/doctors/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (body?.fullName !== undefined) {
    const fullName = String(body.fullName).trim();
    if (!fullName) return badRequest("ФИО не может быть пустым");
    data.fullName = fullName;
  }
  if (body?.phone !== undefined) data.phone = body.phone ? String(body.phone) : null;
  if (body?.birthDate !== undefined) data.birthDate = parseDate(body.birthDate);
  if (body?.statusId !== undefined) data.statusId = body.statusId || null;
  if (body?.mpId !== undefined) {
    const mpId = String(body.mpId);
    const mp = await db.user.findUnique({ where: { id: mpId } });
    if (!mp || mp.role !== "MP") return badRequest("Указанный пользователь не является МП");
    data.mpId = mpId;
  }
  if (body?.cityId !== undefined) data.cityId = body.cityId || null;
  if (body?.comment !== undefined) data.comment = body.comment ? String(body.comment) : null;
  if (body?.bonusType !== undefined) data.bonusType = body.bonusType || null;
  if (body?.payoutDetails !== undefined) data.payoutDetails = body.payoutDetails ? String(body.payoutDetails) : null;

  const doctor = await db.doctor.update({ where: { id }, data }).catch(() => null);
  if (!doctor) return notFound("Врач не найден");

  if (Array.isArray(body?.lpuIds)) {
    const lpuIds: string[] = body.lpuIds;
    await db.doctorLpu.deleteMany({ where: { doctorId: id } });
    if (lpuIds.length) {
      await db.doctorLpu.createMany({ data: lpuIds.map((lpuId) => ({ doctorId: id, lpuId })) });
    }
    if (!doctor.cityId && lpuIds.length === 1) {
      const lpu = await db.lpu.findUnique({ where: { id: lpuIds[0] } });
      if (lpu) await db.doctor.update({ where: { id }, data: { cityId: lpu.cityId } });
    }
  }

  await audit(session, "UPDATE", "doctor", id, `НВ: ${doctor.fullName}`);
  return NextResponse.json(doctor);
}

// DELETE /api/app/doctors/[id] — только МП
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireMP();
  if (error) return error;
  const { id } = await params;
  const doctor = await db.doctor.delete({ where: { id } }).catch(() => null);
  if (!doctor) return notFound("Врач не найден");
  await audit(session, "DELETE", "doctor", id, `НВ: ${doctor.fullName}`);
  return NextResponse.json({ ok: true });
}

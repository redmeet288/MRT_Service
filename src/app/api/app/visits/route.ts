import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, parseDate, requireAuth } from "@/lib/api-helpers";

const STATUSES = ["PLANNED", "CONDUCTED", "CANCELLED"];

// GET /api/app/visits?from=&to=&mpId=&status=&doctorId=
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const from = parseDate(sp.get("from"));
  const to = parseDate(sp.get("to"));
  const mpId = sp.get("mpId");
  const status = sp.get("status");
  const doctorId = sp.get("doctorId");
  const visits = await db.visit.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(mpId ? { mpId } : {}),
      ...(status ? { status } : {}),
      ...(doctorId ? { doctorId } : {}),
    },
    orderBy: { date: "asc" },
    include: {
      doctor: { select: { id: true, fullName: true } },
      lpu: { include: { city: true } },
      mp: { select: { id: true, name: true } },
    },
    take: 2000,
  });
  return NextResponse.json(visits);
}

// POST /api/app/visits — создание события «Визит к НВ»
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const doctorId = String(body?.doctorId ?? "");
  const date = parseDate(body?.date);
  const purpose = String(body?.purpose ?? "").trim();
  if (!doctorId) return badRequest("Выберите врача (НВ)");
  if (!date) return badRequest("Укажите дату визита");
  if (!purpose) return badRequest("Укажите цель визита");
  const status = STATUSES.includes(body?.status) ? body.status : "PLANNED";
  const doctor = await db.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return badRequest("Врач не найден");
  const visit = await db.visit.create({
    data: {
      doctorId,
      lpuId: body?.lpuId ? String(body.lpuId) : null,
      mpId: body?.mpId ? String(body.mpId) : session.uid,
      date,
      purpose,
      comment: body?.comment ? String(body.comment) : null,
      status,
    },
  });
  await audit(session, "CREATE", "visit", visit.id, `Визит: ${doctor.fullName} — ${purpose}`);
  return NextResponse.json(visit, { status: 201 });
}

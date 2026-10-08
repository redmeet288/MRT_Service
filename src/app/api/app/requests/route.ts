import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, parseDate, requireAuth } from "@/lib/api-helpers";

// GET /api/app/requests?from=&to=&mpId=&lpuId=&doctorId=&done=&assignedId=
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const from = parseDate(sp.get("from"));
  const to = parseDate(sp.get("to"));
  const mpId = sp.get("mpId");
  const lpuId = sp.get("lpuId");
  const doctorId = sp.get("doctorId");
  const assignedId = sp.get("assignedId");
  const done = sp.get("done"); // "1" — только выполненные, "0" — только невыполненные
  const requests = await db.request.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(mpId ? { doctor: { mpId } } : {}),
      ...(lpuId ? { lpuId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(assignedId ? { assignedId } : {}),
      ...(done === "1" ? { doneId: { not: null } } : {}),
      ...(done === "0" ? { doneId: null } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      doctor: { select: { id: true, fullName: true, mp: { select: { id: true, name: true } } } },
      lpu: { include: { city: true } },
      assigned: true,
      done: true,
      author: { select: { id: true, name: true } },
    },
    // Защита от несанкционированного выкачивания больших объемов:
    // базовый лимит выгрузки за один запрос
    take: 5000,
  });
  return NextResponse.json(requests);
}

// POST /api/app/requests — регистрация направления
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const date = parseDate(body?.date) ?? new Date();
  const patientName = String(body?.patientName ?? "").trim();
  const doctorId = String(body?.doctorId ?? "");
  const lpuId = String(body?.lpuId ?? "");
  if (!patientName) return badRequest("Укажите ФИО пациента");
  if (!doctorId) return badRequest("Выберите ФИО НВ");
  if (!lpuId) return badRequest("Укажите ЛПУ");
  const doctor = await db.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) return badRequest("Врач (НВ) не найден");
  const assignedId = body?.assignedId ? String(body.assignedId) : null;
  const doneId = body?.doneId ? String(body.doneId) : null;
  const request = await db.request.create({
    data: {
      date,
      patientName,
      doctorId,
      lpuId,
      destination: body?.destination ? String(body.destination) : null,
      assignedId,
      doneId,
      authorId: session.uid,
    },
  });
  await audit(
    session,
    "CREATE",
    "request",
    request.id,
    `Заявка: ${patientName}, НВ: ${doctor.fullName}`
  );
  return NextResponse.json(request, { status: 201 });
}

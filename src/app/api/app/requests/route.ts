import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, parseDate, requireAuth } from "@/lib/api-helpers";
import { DEFAULT_DESTINATION, idList } from "@/lib/request-items";

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
  const done = sp.get("done"); // "1" — с позицией «Что сделано», "0" — без
  const requests = await db.request.findMany({
    where: {
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(mpId ? { doctor: { mpId } } : {}),
      ...(lpuId ? { lpuId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(assignedId
        ? {
            OR: [
              { items: { some: { nomenclatureId: assignedId, kind: "ASSIGNED" } } },
              { assignedId },
            ],
          }
        : {}),
      ...(done === "1" ? { items: { some: { kind: "DONE" } } } : {}),
      ...(done === "0" ? { items: { none: { kind: "DONE" } } } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      doctor: { select: { id: true, fullName: true, mp: { select: { id: true, name: true } } } },
      lpu: { include: { city: true } },
      items: { include: { nomenclature: true } },
      author: { select: { id: true, name: true } },
    },
    // Защита от несанкционированного выкачивания больших объемов:
    // базовый лимит выгрузки за один запрос
    take: 5000,
  });
  return NextResponse.json(
    requests.map((r) => ({
      ...r,
      assignedItems: r.items.filter((i) => i.kind === "ASSIGNED").map((i) => i.nomenclature),
      doneItems: r.items.filter((i) => i.kind === "DONE").map((i) => i.nomenclature),
      items: undefined,
    }))
  );
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
  // «Куда направление»: незаполненное поле автоматически заменяется на «МРТ ТОЧНО»
  const destination =
    body?.destination && String(body.destination).trim()
      ? String(body.destination).trim()
      : DEFAULT_DESTINATION;
  const assignedIds = idList(body?.assignedIds ?? body?.assignedId);
  const doneIds = idList(body?.doneIds ?? body?.doneId);
  const request = await db.request.create({
    data: {
      date,
      patientName,
      doctorId,
      lpuId,
      destination,
      assignedId: assignedIds[0] ?? null,
      doneId: doneIds[0] ?? null,
      comment: body?.comment ? String(body.comment) : null,
      authorId: session.uid,
      items: {
        create: [
          ...assignedIds.map((nomenclatureId) => ({ nomenclatureId, kind: "ASSIGNED" })),
          ...doneIds.map((nomenclatureId) => ({ nomenclatureId, kind: "DONE" })),
        ],
      },
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

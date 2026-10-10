import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, parseDate, requireAuth, requireMP } from "@/lib/api-helpers";
import { DEFAULT_DESTINATION, idList, syncRequestItems } from "@/lib/request-items";

type Params = { params: Promise<{ id: string }> };

// PUT /api/app/requests/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (body?.date !== undefined) {
    const date = parseDate(body.date);
    if (!date) return badRequest("Некорректная дата");
    data.date = date;
  }
  if (body?.patientName !== undefined) {
    const patientName = String(body.patientName).trim();
    if (!patientName) return badRequest("ФИО пациента не может быть пустым");
    data.patientName = patientName;
  }
  // НВ и ЛПУ необязательны: пустое значение = очистить привязку (доработка)
  if (body?.doctorId !== undefined) data.doctorId = body.doctorId ? String(body.doctorId) : null;
  if (body?.lpuId !== undefined) data.lpuId = body.lpuId ? String(body.lpuId) : null;
  // «Куда направление»: пустое значение → «МРТ ТОЧНО» (доработка 1.2)
  if (body?.destination !== undefined) {
    data.destination =
      body.destination && String(body.destination).trim()
        ? String(body.destination).trim()
        : DEFAULT_DESTINATION;
  }
  if (body?.comment !== undefined) data.comment = body.comment ? String(body.comment) : null;

  const request = await db.request.update({ where: { id }, data }).catch(() => null);
  if (!request) return notFound("Заявка не найдена");

  // Мультиноменклатура (доработка 1.2): полная замена наборов позиций
  if (body?.assignedIds !== undefined || body?.doneIds !== undefined) {
    const assignedIds = body?.assignedIds !== undefined ? idList(body.assignedIds) : undefined;
    const doneIds = body?.doneIds !== undefined ? idList(body.doneIds) : undefined;
    if (assignedIds || doneIds) {
      const existing = await db.requestNomenclatureItem.findMany({ where: { requestId: id } });
      const finalAssigned = assignedIds ?? existing.filter((i) => i.kind === "ASSIGNED").map((i) => i.nomenclatureId);
      const finalDone = doneIds ?? existing.filter((i) => i.kind === "DONE").map((i) => i.nomenclatureId);
      await syncRequestItems(id, finalAssigned, finalDone);
    }
  } else if (body?.assignedId !== undefined || body?.doneId !== undefined) {
    // Legacy-совместимость: одиночные значения
    const existing = await db.requestNomenclatureItem.findMany({ where: { requestId: id } });
    const assignedIds = body?.assignedId !== undefined ? idList(body.assignedId) : existing.filter((i) => i.kind === "ASSIGNED").map((i) => i.nomenclatureId);
    const doneIds = body?.doneId !== undefined ? idList(body.doneId) : existing.filter((i) => i.kind === "DONE").map((i) => i.nomenclatureId);
    await syncRequestItems(id, assignedIds, doneIds);
  }

  await audit(session, "UPDATE", "request", id, `Заявка: ${request.patientName}`);
  return NextResponse.json(request);
}

// DELETE /api/app/requests/[id] — только МП
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireMP();
  if (error) return error;
  const { id } = await params;
  const request = await db.request.delete({ where: { id } }).catch(() => null);
  if (!request) return notFound("Заявка не найдена");
  await audit(session, "DELETE", "request", id, `Заявка: ${request.patientName}`);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, parseDate, requireAuth, requireMP } from "@/lib/api-helpers";

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
  if (body?.doctorId !== undefined) data.doctorId = String(body.doctorId);
  if (body?.lpuId !== undefined) data.lpuId = String(body.lpuId);
  if (body?.destination !== undefined) data.destination = body.destination ? String(body.destination) : null;
  if (body?.assignedId !== undefined) data.assignedId = body.assignedId || null;
  if (body?.doneId !== undefined) data.doneId = body.doneId || null;
  const request = await db.request.update({ where: { id }, data }).catch(() => null);
  if (!request) return notFound("Заявка не найдена");
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

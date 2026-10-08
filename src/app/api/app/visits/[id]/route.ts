import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, parseDate, requireAuth, requireMP } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };
const STATUSES = ["PLANNED", "CONDUCTED", "CANCELLED"];

// PUT /api/app/visits/[id]
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
  if (body?.purpose !== undefined) data.purpose = String(body.purpose).trim();
  if (body?.comment !== undefined) data.comment = body.comment ? String(body.comment) : null;
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) return badRequest("Некорректный статус");
    data.status = body.status;
  }
  if (body?.lpuId !== undefined) data.lpuId = body.lpuId || null;
  if (body?.doctorId !== undefined) data.doctorId = String(body.doctorId);
  const visit = await db.visit.update({ where: { id }, data }).catch(() => null);
  if (!visit) return notFound("Визит не найден");
  await audit(session, "UPDATE", "visit", id, `Визит от ${visit.date.toISOString().slice(0, 10)} → ${visit.status}`);
  return NextResponse.json(visit);
}

// DELETE /api/app/visits/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireMP();
  if (error) return error;
  const { id } = await params;
  const visit = await db.visit.delete({ where: { id } }).catch(() => null);
  if (!visit) return notFound("Визит не найден");
  await audit(session, "DELETE", "visit", id, `Визит: ${visit.purpose}`);
  return NextResponse.json({ ok: true });
}

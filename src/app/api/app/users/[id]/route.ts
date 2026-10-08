import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, notFound, requireMP } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";

type Params = { params: Promise<{ id: string }> };

// PUT /api/app/users/[id] — только МП
export async function PUT(req: NextRequest, { params }: Params) {
  const { session, error } = await requireMP();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (body?.name !== undefined) data.name = String(body.name).trim();
  if (body?.role !== undefined) data.role = body.role === "MP" ? "MP" : "OPERATOR";
  if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body?.password) {
    const password = String(body.password);
    if (password.length < 6) return badRequest("Пароль — минимум 6 символов");
    data.password = bcrypt.hashSync(password, 10);
  }
  const user = await db.user
    .update({ where: { id }, data, select: { id: true, login: true, name: true, role: true, isActive: true, createdAt: true } })
    .catch(() => null);
  if (!user) return notFound("Пользователь не найден");
  await audit(session, "UPDATE", "user", id, `Пользователь: ${user.name}`);
  return NextResponse.json(user);
}

// DELETE /api/app/users/[id] — только МП; деактивация вместо удаления
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireMP();
  if (error) return error;
  const { id } = await params;
  if (id === session.uid) return badRequest("Нельзя деактивировать себя");
  const doctorsCount = await db.doctor.count({ where: { mpId: id } });
  if (doctorsCount > 0)
    return badRequest(`У МП есть курируемые врачи (${doctorsCount}). Переназначьте врачей.`);
  const user = await db.user.update({ where: { id }, data: { isActive: false } }).catch(() => null);
  if (!user) return notFound("Пользователь не найден");
  await audit(session, "UPDATE", "user", id, `Деактивирован: ${user.name}`);
  return NextResponse.json({ ok: true });
}

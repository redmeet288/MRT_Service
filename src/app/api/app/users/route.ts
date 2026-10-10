import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, requireAuth, requireMP } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";

// GET /api/app/users?basic=1 — basic=1 доступен всем (для фильтров по МП),
// полный список — только МП
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const basic = req.nextUrl.searchParams.get("basic") === "1";
  if (basic && session.role !== "MP") {
    const users = await db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(users);
  }
  const users = await db.user.findMany({
    select: {
      id: true, login: true, name: true, role: true, isActive: true,
      createdAt: true, _count: { select: { doctors: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(users);
}

// POST /api/app/users — только МП
export async function POST(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const login = String(body?.login ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");
  const role = body?.role === "MP" ? "MP" : "OPERATOR";
  if (!login || !name) return badRequest("Укажите логин и имя");
  if (password.length < 6) return badRequest("Пароль — минимум 6 символов");
  const dup = await db.user.findUnique({ where: { login } });
  if (dup) return badRequest("Такой логин уже существует");
  const user = await db.user.create({
    data: { login, name, role, password: bcrypt.hashSync(password, 10) },
    select: { id: true, login: true, name: true, role: true, isActive: true, createdAt: true },
  });
  await audit(session, "CREATE", "user", user.id, `Пользователь: ${name} (${login})`);
  return NextResponse.json(user, { status: 201 });
}

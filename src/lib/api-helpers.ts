import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export type SessionUser = {
  uid: string;
  name: string;
  role: "MP" | "OPERATOR";
};

/** Возвращает сессию или null */
export async function getSession(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) return null;
  return {
    uid: session.user.uid,
    name: session.user.name ?? "",
    role: session.user.role,
  };
}

/** 401 если не авторизован */
export function unauthorized() {
  return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
}

/** 403 если нет прав */
export function forbidden(msg = "Недостаточно прав") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

/** 404 */
export function notFound(msg = "Не найдено") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

/** 400 */
export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/** Проверка доступа к API: requireAuth(req) → сессия | Response */
export async function requireAuth(): Promise<
  { session: SessionUser; error: null } | { session: null; error: NextResponse }
> {
  const session = await getSession();
  if (!session) return { session: null, error: unauthorized() };
  return { session, error: null };
}

/** Только МП может: удалять записи справочников, управлять пользователями */
export function requireMP(): Promise<
  { session: SessionUser; error: null } | { session: null; error: NextResponse }
> {
  return requireAuth().then((r) => {
    if (r.error) return r;
    if (r.session!.role !== "MP") return { session: null, error: forbidden() };
    return { session: r.session!, error: null };
  });
}

/** Запись в журнал аудита (изменения ключевых сущностей, экспорты, импорты) */
export async function audit(
  user: SessionUser | null,
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "IMPORT" | "LOGIN",
  entity: string,
  entityId?: string,
  details?: string
) {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.uid ?? null,
        userName: user?.name ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ?? null,
      },
    });
  } catch (e) {
    console.error("audit log error", e);
  }
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

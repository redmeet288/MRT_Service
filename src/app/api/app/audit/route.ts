import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, requireAuth, requireMP } from "@/lib/api-helpers";

// GET /api/app/audit?limit=200 — журнал действий (только МП)
export async function GET(req: NextRequest) {
  const { session, error } = await requireMP();
  if (error) return error;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 200, 500);
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json(logs);
}

// POST /api/app/audit — фиксация события (например, экспорт отчета)
// Используется как защита от несанкционированного экспорта: каждое
// действие экспорта логируется с пользователем и параметрами.
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const action = body?.action === "EXPORT" ? "EXPORT" : "UPDATE";
  const entity = String(body?.entity ?? "").trim();
  if (!entity) return badRequest("Не указана сущность");
  await audit(session, action, entity, body?.entityId ?? undefined, body?.details ?? undefined);
  return NextResponse.json({ ok: true });
}

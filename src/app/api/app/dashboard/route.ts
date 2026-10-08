import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/app/dashboard — KPI для дашборда
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [doctorsTotal, lpusTotal, requests30, done30, plannedVisits, totalRequests] =
    await Promise.all([
      db.doctor.count(),
      db.lpu.count(),
      db.request.count({ where: { date: { gte: monthAgo } } }),
      db.request.count({ where: { date: { gte: monthAgo }, doneId: { not: null } } }),
      db.visit.count({ where: { date: { gte: now, lte: weekAhead }, status: "PLANNED" } }),
      db.request.count(),
    ]);

  // Динамика заявок по неделям (8 недель)
  const weeks: Array<{ label: string; count: number }> = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const count = await db.request.count({
      where: { date: { gte: start, lt: end } },
    });
    weeks.push({
      label: `${start.getDate()}.${start.getMonth() + 1}–${end.getDate()}.${end.getMonth() + 1}`,
      count,
    });
  }

  // Ближайшие визиты
  const upcomingVisits = await db.visit.findMany({
    where: { date: { gte: weekAgo, lte: weekAhead }, status: { in: ["PLANNED", "CONDUCTED"] } },
    orderBy: { date: "asc" },
    take: 8,
    include: {
      doctor: { select: { id: true, fullName: true } },
      mp: { select: { id: true, name: true } },
      lpu: { select: { name: true } },
    },
  });

  // Последние заявки
  const recentRequests = await db.request.findMany({
    orderBy: { date: "desc" },
    take: 6,
    include: {
      doctor: { select: { fullName: true } },
      assigned: true,
      done: true,
      lpu: { select: { name: true } },
    },
  });

  // Топ НВ по заявкам за 30 дней
  const topDoctorsRaw = await db.request.groupBy({
    by: ["doctorId"],
    where: { date: { gte: monthAgo } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });
  const topDoctors = await Promise.all(
    topDoctorsRaw.map(async (row) => {
      const doc = await db.doctor.findUnique({
        where: { id: row.doctorId },
        select: { id: true, fullName: true, mp: { select: { name: true } } },
      });
      return { id: row.doctorId, name: doc?.fullName ?? "—", mp: doc?.mp.name ?? "", count: row._count.id };
    })
  );

  return NextResponse.json({
    kpi: {
      doctorsTotal,
      lpusTotal,
      requests30,
      done30,
      plannedVisits,
      totalRequests,
    },
    weeks,
    upcomingVisits,
    recentRequests,
    topDoctors,
  });
}

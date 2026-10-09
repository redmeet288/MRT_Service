import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/app/dashboard?scope=all|mine
// scope=mine (только для МП) — показатели только по НВ, закрепленным за МП
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const scope = sp.get("scope") === "mine" && session.role === "MP" ? "mine" : "all";

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // Ограничение области «Только мои НВ»
  const doctorScope = scope === "mine" ? { mpId: session.uid } : {};
  const requestScope = scope === "mine" ? { doctor: { mpId: session.uid } } : {};

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [doctorsTotal, lpusTotal, requests30, done30, visits7, totalRequests] =
    await Promise.all([
      db.doctor.count({ where: doctorScope }),
      db.lpu.count({
        where:
          scope === "mine"
            ? { doctors: { some: { doctor: { mpId: session.uid } } } }
            : {},
      }),
      db.request.count({ where: { date: { gte: monthAgo }, ...requestScope } }),
      db.request.count({
        where: {
          date: { gte: monthAgo },
          items: { some: { kind: "DONE" } },
          ...requestScope,
        },
      }),
      db.visit.count({
        where: {
          date: { gte: startOfToday, lte: weekAhead },
          status: { in: ["PLANNED", "CONDUCTED"] },
          ...(scope === "mine" ? { mpId: session.uid } : {}),
        },
      }),
      db.request.count({ where: requestScope }),
    ]);

  // Динамика заявок по неделям (8 недель) — с границами периодов для drill-down
  const weeks: Array<{ label: string; count: number; from: string; to: string }> = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86400000);
    const start = new Date(end.getTime() - 7 * 86400000);
    const count = await db.request.count({
      where: { date: { gte: start, lt: end }, ...requestScope },
    });
    weeks.push({
      label: `${start.getDate()}.${start.getMonth() + 1}–${end.getDate()}.${end.getMonth() + 1}`,
      count,
      from: start.toISOString(),
      to: new Date(end.getTime() - 1).toISOString(),
    });
  }

  // Ближайшие визиты
  const upcomingVisits = await db.visit.findMany({
    where: {
      date: { gte: weekAgo, lte: weekAhead },
      status: { in: ["PLANNED", "CONDUCTED"] },
      ...(scope === "mine" ? { mpId: session.uid } : {}),
    },
    orderBy: { date: "asc" },
    take: 8,
    include: {
      doctor: { select: { id: true, fullName: true } },
      mp: { select: { id: true, name: true } },
      lpu: { select: { name: true } },
    },
  });

  // Топ-10 НВ по заявкам за последний месяц
  const topDoctorsRaw = await db.request.groupBy({
    by: ["doctorId"],
    where: { date: { gte: monthAgo }, ...requestScope },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const topDoctors = await Promise.all(
    topDoctorsRaw.map(async (row) => {
      const doc = await db.doctor.findUnique({
        where: { id: row.doctorId },
        select: { id: true, fullName: true, mp: { select: { name: true } } },
      });
      return {
        id: row.doctorId,
        name: doc?.fullName ?? "—",
        mp: doc?.mp?.name ?? "",
        count: row._count.id,
      };
    })
  );

  return NextResponse.json({
    scope,
    kpi: {
      doctorsTotal,
      lpusTotal,
      requests30,
      done30,
      visits7,
      totalRequests,
    },
    weeks,
    upcomingVisits,
    topDoctors,
  });
}

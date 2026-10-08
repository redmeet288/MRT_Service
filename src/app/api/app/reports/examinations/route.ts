import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, parseDate, requireAuth } from "@/lib/api-helpers";

// GET /api/app/reports/examinations
// Параметры: from, to, mpId, lpuId, doctorId, assignedId, done
// Иерархия: МП → ЛПУ → НВ → детализация (заявки)
// Возвращает дерево с агрегатами. bonusAmount включен, но null
// (колонка «Начисленный бонус» на старте скрыта — задел этапа 2).
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const from = parseDate(sp.get("from")) ?? new Date(Date.now() - 90 * 86400000);
  const toRaw = parseDate(sp.get("to")) ?? new Date();
  if (parseDate(sp.get("to"))) {
    // включительно до конца дня
    toRaw.setHours(23, 59, 59, 999);
  }
  const mpId = sp.get("mpId") || undefined;
  const lpuId = sp.get("lpuId") || undefined;
  const doctorId = sp.get("doctorId") || undefined;
  const assignedId = sp.get("assignedId") || undefined;
  const done = sp.get("done"); // "1" | "0" | null

  const requests = await db.request.findMany({
    where: {
      date: { gte: from, lte: toRaw },
      ...(mpId ? { doctor: { mpId } } : {}),
      ...(lpuId ? { lpuId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(assignedId ? { assignedId } : {}),
      ...(done === "1" ? { doneId: { not: null } } : {}),
      ...(done === "0" ? { doneId: null } : {}),
    },
    include: {
      doctor: { select: { id: true, fullName: true, mpId: true, mp: { select: { id: true, name: true } } } },
      lpu: { select: { id: true, name: true, city: { select: { name: true } } } },
      assigned: true,
      done: true,
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  // Группировка: МП → ЛПУ → НВ
  const mpMap = new Map<string, {
    id: string; name: string; total: number; done: number;
    lpus: Map<string, {
      id: string; name: string; city: string; total: number; done: number;
      doctors: Map<string, {
        id: string; name: string; total: number; done: number;
        requests: Array<{
          id: string; date: string; patientName: string; destination: string | null;
          assigned: string | null; done: string | null; bonus: number | null;
        }>;
      }>;
    }>;
  }>();

  for (const r of requests) {
    const mpKey = r.doctor.mpId;
    if (!mpMap.has(mpKey)) {
      mpMap.set(mpKey, {
        id: mpKey,
        name: r.doctor.mp?.name ?? "—",
        total: 0, done: 0, lpus: new Map(),
      });
    }
    const mp = mpMap.get(mpKey)!;
    const lpuKey = r.lpuId;
    if (!mp.lpus.has(lpuKey)) {
      mp.lpus.set(lpuKey, {
        id: lpuKey,
        name: r.lpu.name,
        city: r.lpu.city?.name ?? "",
        total: 0, done: 0, doctors: new Map(),
      });
    }
    const lpu = mp.lpus.get(lpuKey)!;
    const dKey = r.doctorId;
    if (!lpu.doctors.has(dKey)) {
      lpu.doctors.set(dKey, {
        id: dKey,
        name: r.doctor.fullName,
        total: 0, done: 0, requests: [],
      });
    }
    const doc = lpu.doctors.get(dKey)!;
    const row = {
      id: r.id,
      date: r.date.toISOString(),
      patientName: r.patientName,
      destination: r.destination,
      assigned: r.assigned?.name ?? null,
      done: r.done?.name ?? null,
      bonus: r.bonusAmount ?? null, // задел: колонка скрыта на старте
    };
    doc.requests.push(row);
    doc.total += 1;
    if (r.doneId) doc.done += 1;
    lpu.total += 1;
    if (r.doneId) lpu.done += 1;
    mp.total += 1;
    if (r.doneId) mp.done += 1;
  }

  const tree = Array.from(mpMap.values()).map((mp) => ({
    id: mp.id,
    name: mp.name,
    total: mp.total,
    done: mp.done,
    lpus: Array.from(mp.lpus.values()).map((lpu) => ({
      id: lpu.id,
      name: lpu.name,
      city: lpu.city,
      total: lpu.total,
      done: lpu.done,
      doctors: Array.from(lpu.doctors.values()).map((d) => ({
        id: d.id,
        name: d.name,
        total: d.total,
        done: d.done,
        requests: d.requests,
      })),
    })),
  }));

  await audit(
    session,
    "UPDATE",
    "report",
    undefined,
    `Отчет «По обследованиям»: ${requests.length} заявок, период ${from.toISOString().slice(0, 10)} — ${toRaw.toISOString().slice(0, 10)}`
  );

  return NextResponse.json({ generatedAt: new Date().toISOString(), total: requests.length, tree });
}

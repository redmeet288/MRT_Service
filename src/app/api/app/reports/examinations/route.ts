import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, parseDate, requireAuth } from "@/lib/api-helpers";

// GET /api/app/reports/examinations
// Параметры: from, to, mpId, lpuId, doctorId, assignedId, done,
//            variant=mp|lpu|doctor|nomenclature (вариант группировки, по умолчанию mp)
// Возвращает дерево с агрегатами:
//  - variant=mp:           МП → ЛПУ → НВ → заявки (классический вариант)
//  - variant=lpu:          ЛПУ → НВ → заявки
//  - variant=doctor:       НВ → заявки
//  - variant=nomenclature: Номенклатура («что назначено») → заявки
// bonusAmount включен, но null (колонка «Начисленный бонус» скрыта — задел этапа 2).

type FlatRow = {
  id: string;
  date: string;
  patientName: string;
  destination: string | null;
  assigned: string | null;
  done: string | null;
  bonus: number | null;
  doctorId: string | null;
  doctorName: string;
  mpId: string | null;
  mpName: string;
  lpuId: string | null;
  lpuName: string;
  cityName: string;
  assignedId_: string | null;
  assignedName: string;
};

interface GroupNode {
  level: "mp" | "lpu" | "doctor" | "nomenclature";
  id: string;
  name: string;
  subtitle: string;
  total: number;
  done: number;
  children: GroupNode[];
  requests: FlatRow[];
}

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
  const variantParam = sp.get("variant");
  const variant =
    variantParam && ["mp", "lpu", "doctor", "nomenclature"].includes(variantParam)
      ? variantParam
      : null;

  const requests = await db.request.findMany({
    where: {
      date: { gte: from, lte: toRaw },
      ...(mpId ? { doctor: { mpId } } : {}),
      ...(lpuId ? { lpuId } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(assignedId
        ? {
            OR: [
              { items: { some: { nomenclatureId: assignedId, kind: "ASSIGNED" } } },
              { assignedId },
            ],
          }
        : {}),
      ...(done === "1" ? { items: { some: { kind: "DONE" } } } : {}),
      ...(done === "0" ? { items: { none: { kind: "DONE" } } } : {}),
    },
    include: {
      doctor: { select: { id: true, fullName: true, mpId: true, mp: { select: { id: true, name: true } } } },
      lpu: { select: { id: true, name: true, city: { select: { name: true } } } },
      items: { include: { nomenclature: true } },
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  const flat: FlatRow[] = requests.map((r) => {
    const assignedItems = r.items.filter((i) => i.kind === "ASSIGNED").map((i) => i.nomenclature.name);
    const doneItems = r.items.filter((i) => i.kind === "DONE").map((i) => i.nomenclature.name);
    // Первая позиция «назначено» определяет группировку «По Номенклатуре»
    const firstAssigned = r.items.find((i) => i.kind === "ASSIGNED");
    return {
      id: r.id,
      date: r.date.toISOString(),
      patientName: r.patientName,
      destination: r.destination,
      assigned: assignedItems.join(", ") || null,
      done: doneItems.join(", ") || null,
      bonus: r.bonusAmount ?? null, // задел: колонка скрыта на старте
      doctorId: r.doctorId,
      // НВ/ЛПУ необязательны (доработка): в отчет попадают как «Без НВ» / «Без ЛПУ»
      doctorName: r.doctor?.fullName ?? "Без НВ",
      mpId: r.doctor?.mpId ?? null,
      mpName: r.doctor?.mp?.name ?? "Без МП",
      lpuId: r.lpuId,
      lpuName: r.lpu?.name ?? "Без ЛПУ",
      cityName: r.lpu?.city?.name ?? "",
      assignedId_: firstAssigned?.nomenclatureId ?? r.assignedId,
      assignedName: firstAssigned?.nomenclature.name ?? "Не указано",
    };
  });

  /** Сборка дерева из плоских строк: ключи уровней → агрегаты */
  function buildTree(levels: Array<"mp" | "lpu" | "doctor" | "nomenclature">): GroupNode[] {
    type Node = Omit<GroupNode, "children"> & { childrenMap: Map<string, Node> };
    const root = new Map<string, Node>();

    const keyOf = (r: FlatRow, level: string): { key: string; id: string; name: string; subtitle: string } => {
      switch (level) {
        case "mp":
          return { key: `mp:${r.mpId ?? "none"}`, id: r.mpId ?? "none", name: r.mpName, subtitle: "" };
        case "lpu":
          return { key: `lpu:${r.lpuId ?? "none"}`, id: r.lpuId ?? "none", name: r.lpuName, subtitle: r.cityName };
        case "doctor":
          return { key: `doc:${r.doctorId ?? "none"}`, id: r.doctorId ?? "none", name: r.doctorName, subtitle: r.lpuName };
        case "nomenclature":
          return { key: `nom:${r.assignedId_ ?? "none"}`, id: r.assignedId_ ?? "none", name: r.assignedName, subtitle: "" };
        default:
          return { key: "all", id: "all", name: "Все", subtitle: "" };
      }
    };

    for (const r of flat) {
      let parentMap = root;
      let parentNode: Node | null = null;
      for (let li = 0; li < levels.length; li++) {
        const level = levels[li];
        const k = keyOf(r, level);
        if (!parentMap.has(k.key)) {
          parentMap.set(k.key, {
            level,
            id: k.id,
            name: k.name,
            subtitle: k.subtitle,
            total: 0,
            done: 0,
            requests: [],
            childrenMap: new Map(),
          });
        }
        const node = parentMap.get(k.key)!;
        node.total += 1;
        if (r.done) node.done += 1;
        parentNode = node;
        parentMap = node.childrenMap;
      }
      if (parentNode) parentNode.requests.push(r);
    }

    function toNodes(map: Map<string, Node>): GroupNode[] {
      return Array.from(map.values()).map(({ childrenMap, ...n }) => ({
        ...n,
        children: toNodes(childrenMap),
      }));
    }
    return toNodes(root);
  }

  let tree: GroupNode[] | LegacyTree;
  if (variant === "lpu") {
    tree = buildTree(["lpu", "doctor"]);
  } else if (variant === "doctor") {
    tree = buildTree(["doctor"]);
  } else if (variant === "nomenclature") {
    tree = buildTree(["nomenclature"]);
  } else if (variant === "mp") {
    tree = buildTree(["mp", "lpu", "doctor"]);
  } else {
    // —— Совместимый формат (МП → ЛПУ → НВ) для предыдущей версии клиента ——
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
    for (const r of flat) {
      const mpKey = r.mpId ?? "none";
      if (!mpMap.has(mpKey)) {
        mpMap.set(mpKey, { id: mpKey, name: r.mpName, total: 0, done: 0, lpus: new Map() });
      }
      const mp = mpMap.get(mpKey)!;
      const lpuKey = r.lpuId ?? "none";
      if (!mp.lpus.has(lpuKey)) {
        mp.lpus.set(lpuKey, {
          id: lpuKey, name: r.lpuName, city: r.cityName, total: 0, done: 0, doctors: new Map(),
        });
      }
      const lpu = mp.lpus.get(lpuKey)!;
      const dKey = r.doctorId ?? "none";
      if (!lpu.doctors.has(dKey)) {
        lpu.doctors.set(dKey, { id: dKey, name: r.doctorName, total: 0, done: 0, requests: [] });
      }
      const doc = lpu.doctors.get(dKey)!;
      doc.requests.push({
        id: r.id, date: r.date, patientName: r.patientName, destination: r.destination,
        assigned: r.assigned, done: r.done, bonus: r.bonus,
      });
      doc.total += 1;
      if (r.done) doc.done += 1;
      lpu.total += 1;
      if (r.done) lpu.done += 1;
      mp.total += 1;
      if (r.done) mp.done += 1;
    }
    tree = Array.from(mpMap.values()).map((mp) => ({
      id: mp.id, name: mp.name, total: mp.total, done: mp.done,
      lpus: Array.from(mp.lpus.values()).map((lpu) => ({
        id: lpu.id, name: lpu.name, city: lpu.city, total: lpu.total, done: lpu.done,
        doctors: Array.from(lpu.doctors.values()).map((d) => ({
          id: d.id, name: d.name, total: d.total, done: d.done, requests: d.requests,
        })),
      })),
    }));
  }

  await audit(
    session,
    "UPDATE",
    "report",
    undefined,
    `Отчет «По обследованиям»${variant ? ` (вариант: ${variant})` : ""}: ${flat.length} заявок, период ${from.toISOString().slice(0, 10)} — ${toRaw.toISOString().slice(0, 10)}`
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: flat.length,
    variant: variant ?? "mp",
    tree,
  });
}

type LegacyTree = Array<{
  id: string; name: string; total: number; done: number;
  lpus: Array<{
    id: string; name: string; city: string; total: number; done: number;
    doctors: Array<{
      id: string; name: string; total: number; done: number;
      requests: Array<{
        id: string; date: string; patientName: string; destination: string | null;
        assigned: string | null; done: string | null; bonus: number | null;
      }>;
    }>;
  }>;
}>;

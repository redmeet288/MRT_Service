import { db } from "@/lib/db";

// ============================================================
// Общие хелперы заявок (доработка 1.2): мультиноменклатура и
// значение «Куда направление» по умолчанию.
// ============================================================

/** Значение «Куда направление» по умолчанию */
export const DEFAULT_DESTINATION = "МРТ ТОЧНО";

/**
 * Синхронизация позиций номенклатуры заявки:
 * assignedIds — «Что назначено», doneIds — «Что сделано».
 * Первые позиции дублируются в legacy-поля assignedId/doneId
 * (совместимость фильтров и существующих отчетов).
 */
export async function syncRequestItems(
  requestId: string,
  assignedIds: string[],
  doneIds: string[]
) {
  await db.requestNomenclatureItem.deleteMany({ where: { requestId } });
  const rows = [
    ...assignedIds.map((nomenclatureId) => ({ requestId, nomenclatureId, kind: "ASSIGNED" })),
    ...doneIds.map((nomenclatureId) => ({ requestId, nomenclatureId, kind: "DONE" })),
  ];
  if (rows.length) {
    await db.requestNomenclatureItem.createMany({ data: rows });
  }
  await db.request.update({
    where: { id: requestId },
    data: {
      assignedId: assignedIds[0] ?? null,
      doneId: doneIds[0] ?? null,
    },
  });
}

/** Нормализация списков id номенклатуры из тела запроса */
export function idList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  return value ? [String(value)] : [];
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, badRequest, requireAuth } from "@/lib/api-helpers";

type Row = Record<string, string | undefined>;

function norm(v: string | undefined): string {
  return String(v ?? "").trim();
}

// POST /api/app/import — массовый импорт справочников из Excel/CSV
// body: { kind: "lpus", rows: [{ name, city, address }] }
//     | { kind: "doctors", rows: [{ fullName, phone, birthDate, status, city, mpLogin?, lpus }] }
//     | { kind: "cities", rows: [{ name }] }
//     | { kind: "nomenclature", rows: [{ name, category, isActive }] }
//     | { kind: "statuses", rows: [{ name, color }] }
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return badRequest("Нет строк для импорта");

  const result = { created: 0, skipped: 0, errors: [] as string[] };

  if (kind === "lpus") {
    // Кэш городов
    const cities = await db.city.findMany();
    const cityMap = new Map(cities.map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < rows.length; i++) {
      const name = norm(rows[i].name);
      const cityName = norm(rows[i].city);
      const address = norm(rows[i].address) || null;
      if (!name || !cityName) {
        result.errors.push(`Строка ${i + 2}: не указано название ЛПУ или город`);
        continue;
      }
      let cityId = cityMap.get(cityName.toLowerCase());
      if (!cityId) {
        const city = await db.city.create({ data: { name: cityName } });
        cityMap.set(cityName.toLowerCase(), city.id);
        cityId = city.id;
      }
      const dup = await db.lpu.findFirst({ where: { name, cityId } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      await db.lpu.create({ data: { name, cityId, address } });
      result.created += 1;
    }
  } else if (kind === "doctors") {
    const users = await db.user.findMany({ where: { role: "MP" } });
    const mpByLogin = new Map(users.map((u) => [u.login, u.id]));
    const statuses = await db.cooperationStatus.findMany();
    const statusMap = new Map(statuses.map((s) => [s.name.toLowerCase(), s.id]));
    const cities = await db.city.findMany();
    const cityMap = new Map(cities.map((c) => [c.name.toLowerCase(), c.id]));
    const lpus = await db.lpu.findMany();
    const lpuMap = new Map(lpus.map((l) => [`${l.name.toLowerCase()}|${l.cityId}`, l.id]));
    const allLpus = await db.lpu.findMany();
    const lpuByName = new Map(allLpus.map((l) => [l.name.toLowerCase(), l.id]));

    for (let i = 0; i < rows.length; i++) {
      const fullName = norm(rows[i].fullName);
      if (!fullName) {
        result.errors.push(`Строка ${i + 2}: не указано ФИО врача`);
        continue;
      }
      const mpLogin = norm(rows[i].mpLogin).toLowerCase();
      // МП не обязателен: НВ без куратора создается без привязки (закрепит МП позже)
      const mpId = mpLogin ? mpByLogin.get(mpLogin) : null;
      if (mpLogin && !mpId) {
        result.errors.push(`Строка ${i + 2}: МП с логином «${mpLogin}» не найден`);
        continue;
      }
      const dup = await db.doctor.findFirst({ where: { fullName } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      let cityId: string | null = null;
      const cityName = norm(rows[i].city);
      if (cityName) {
        cityId = cityMap.get(cityName.toLowerCase()) ?? null;
        if (!cityId) {
          const c = await db.city.create({ data: { name: cityName } });
          cityMap.set(cityName.toLowerCase(), c.id);
          cityId = c.id;
        }
      }
      let statusId: string | null = null;
      const statusName = norm(rows[i].status);
      if (statusName) {
        statusId =
          statusMap.get(statusName.toLowerCase()) ??
          (
            await db.cooperationStatus.create({ data: { name: statusName } })
          ).id;
      }
      const birthRaw = norm(rows[i].birthDate);
      let birthDate: Date | null = null;
      if (birthRaw) {
        const d = new Date(birthRaw.split(".").reverse().join("-"));
        if (!isNaN(d.getTime())) birthDate = d;
      }
      // ЛПУ: через «;» — привязка по названию
      const lpuNames = norm(rows[i].lpus)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      const doctor = await db.doctor.create({
        data: {
          fullName,
          phone: norm(rows[i].phone) || null,
          birthDate,
          statusId,
          cityId,
          mpId,
        },
      });
      for (const lpuName of lpuNames) {
        let lpuId = lpuMap.get(lpuName.toLowerCase()) ?? lpuByName.get(lpuName.toLowerCase());
        if (!lpuId) {
          // Создаем ЛПУ в городе врача, если не найдено
          if (!cityId) {
            result.errors.push(`Строка ${i + 2}: ЛПУ «${lpuName}» не найдено и город врача не указан`);
            continue;
          }
          const created = await db.lpu.create({ data: { name: lpuName, cityId } });
          lpuByName.set(lpuName.toLowerCase(), created.id);
          lpuId = created.id;
        }
        await db.doctorLpu.create({ data: { doctorId: doctor.id, lpuId } });
      }
      result.created += 1;
    }
  } else if (kind === "cities") {
    for (let i = 0; i < rows.length; i++) {
      const name = norm(rows[i].name);
      if (!name) {
        result.errors.push(`Строка ${i + 2}: не указано название города`);
        continue;
      }
      const dup = await db.city.findFirst({ where: { name } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      await db.city.create({ data: { name } });
      result.created += 1;
    }
  } else if (kind === "nomenclature") {
    for (let i = 0; i < rows.length; i++) {
      const name = norm(rows[i].name);
      const category = norm(rows[i].category) || "Обследования";
      if (!name) {
        result.errors.push(`Строка ${i + 2}: не указано наименование номенклатуры`);
        continue;
      }
      const dup = await db.nomenclature.findFirst({ where: { name, category } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      const activeRaw = norm(rows[i].isActive).toLowerCase();
      const isActive = !(activeRaw === "0" || activeRaw === "нет" || activeRaw === "false");
      await db.nomenclature.create({ data: { name, category, isActive } });
      result.created += 1;
    }
  } else if (kind === "statuses") {
    for (let i = 0; i < rows.length; i++) {
      const name = norm(rows[i].name);
      if (!name) {
        result.errors.push(`Строка ${i + 2}: не указано название статуса`);
        continue;
      }
      const dup = await db.cooperationStatus.findFirst({ where: { name } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      const color = norm(rows[i].color) || undefined;
      await db.cooperationStatus.create({ data: { name, ...(color ? { color } : {}) } });
      result.created += 1;
    }
  } else if (kind === "specializations") {
    // Доработка 1.2: импорт справочника «Специализация врача»
    for (let i = 0; i < rows.length; i++) {
      const name = norm(rows[i].name);
      if (!name) {
        result.errors.push(`Строка ${i + 2}: не указано название специализации`);
        continue;
      }
      const dup = await db.specialization.findFirst({ where: { name } });
      if (dup) {
        result.skipped += 1;
        continue;
      }
      await db.specialization.create({ data: { name } });
      result.created += 1;
    }
  } else {
    return badRequest("Неизвестный тип импорта");
  }

  const entityMap: Record<string, string> = {
    doctors: "doctor", lpus: "lpu", cities: "city",
    nomenclature: "nomenclature", statuses: "status", specializations: "specialization",
  };
  await audit(
    session,
    "IMPORT",
    entityMap[kind] ?? kind,
    undefined,
    `Импорт ${kind}: создано ${result.created}, пропущено ${result.skipped}, ошибок ${result.errors.length}`
  );
  return NextResponse.json(result);
}

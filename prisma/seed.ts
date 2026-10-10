import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
};
const daysAhead = (n: number) => daysAgo(-n);

async function main() {
  console.log("Seeding…");
  await db.auditLog.deleteMany();
  await db.bonusTransaction.deleteMany();
  await db.requestNomenclatureItem.deleteMany();
  await db.doctorSpecialization.deleteMany();
  await db.request.deleteMany();
  await db.visit.deleteMany();
  await db.doctorLpu.deleteMany();
  await db.doctor.deleteMany();
  await db.reportPreset.deleteMany();
  await db.specialization.deleteMany();
  await db.nomenclature.deleteMany();
  await db.cooperationStatus.deleteMany();
  await db.lpu.deleteMany();
  await db.city.deleteMany();
  await db.user.deleteMany();

  const hash = bcrypt.hashSync("mrtno2026", 10);

  // —— Пользователи ——
  const mp1 = await db.user.create({
    data: { login: "m.ivanova", password: hash, name: "Иванова Мария Сергеевна", role: Role.MP },
  });
  const mp2 = await db.user.create({
    data: { login: "a.petrov", password: hash, name: "Петров Алексей Владимирович", role: Role.MP },
  });
  await db.user.create({
    data: { login: "a.sidorova", password: hash, name: "Сидорова Анна Игоревна", role: Role.OPERATOR },
  });

  // —— Города ——
  const troitsk = await db.city.create({ data: { name: "Троицк" } });
  const chelyabinsk = await db.city.create({ data: { name: "Челябинск" } });
  const yuzhnouralsk = await db.city.create({ data: { name: "Южноуральск" } });

  // —— Статусы сотрудничества ——
  const stIP = await db.cooperationStatus.create({ data: { name: "ИП", color: "#0196d2" } });
  const stSZ = await db.cooperationStatus.create({ data: { name: "СЗ", color: "#7692cb" } });
  const stShtat = await db.cooperationStatus.create({ data: { name: "Штат", color: "#194688" } });
  const stChP = await db.cooperationStatus.create({ data: { name: "Частная практика", color: "#e8a486" } });

  // —— Номенклатура (по прейскуранту гайдлайна) ——
  const nom = async (name: string, category: string) =>
    db.nomenclature.create({ data: { name, category } });
  const nAll = await nom("«Весь организм»", "Комплексные");
  const nHead1 = await nom("«Причина боли в голове 1»", "Комплексные");
  const nSpine1 = await nom("«Причина боли в позвоночнике 1а»", "Комплексные");
  const nAbdomen = await nom("«Причина боли в животе»", "Комплексные");
  const nKnee = await nom("«Причина проблем с коленями»", "Комплексные");
  const nBrain = await nom("МРТ головного мозга", "Обследования");
  const nPituitary = await nom("МРТ гипофиза", "Обследования");
  const nCervical = await nom("МРТ шейного отдела позвоночника", "Обследования");
  const nThoracic = await nom("МРТ грудного отдела позвоночника", "Обследования");
  const nLumbar = await nom("МРТ пояснично-крестцового отдела позвоночника", "Обследования");
  const nJoint = await nom("МРТ крупных суставов", "Обследования");
  const nAbd = await nom("МРТ брюшной полости", "Обследования");
  const nPelvis = await nom("МРТ малого таза", "Обследования");

  // —— ЛПУ ——
  const lpu = (name: string, cityId: string, address: string) =>
    db.lpu.create({ data: { name, cityId, address } });
  const lpuGB1 = await lpu("МУЗ «Городская больница № 1»", troitsk.id, "г. Троицк, ул. Пионерская, 52а");
  const lpuPoly2 = await lpu("Поликлиника № 2", troitsk.id, "г. Троицк, ул. Гагарина, 18");
  const lpuMedLine = await lpu("Медцентр «Медлайн»", troitsk.id, "г. Троицк, ул. Советская, 5");
  const lpuGKB5 = await lpu("ГКБ № 5", chelyabinsk.id, "г. Челябинск, пр. Победы, 287");
  const lpuUral = await lpu("Клиника «Уральская»", chelyabinsk.id, "г. Челябинск, ул. Блюхера, 3");
  const lpuYuzh = await lpu("Районная больница", yuzhnouralsk.id, "г. Южноуральск, ул. Мира, 12");

  // —— НВ (направляющие врачи) ——
  const mkDoctor = (fullName: string, mpId: string, statusId: string, cityId: string, phone: string, lpus: string[], birth: string) =>
    db.doctor.create({
      data: {
        fullName, mpId, statusId, cityId, phone,
        birthDate: new Date(birth),
        lpus: { create: lpus.map((lpuId) => ({ lpuId })) },
      },
    });

  const d1 = await mkDoctor("Смирнов Дмитрий Александрович", mp1.id, stShtat.id, troitsk.id, "+7 (35163) 5-20-03", [lpuGB1.id, lpuPoly2.id], "1978-04-12");
  const d2 = await mkDoctor("Кузнецова Ольга Петровна", mp1.id, stIP.id, troitsk.id, "+7 (919) 345-11-20", [lpuMedLine.id], "1985-09-02");
  const d3 = await mkDoctor("Волков Игорь Николаевич", mp1.id, stSZ.id, troitsk.id, "+7 (902) 111-22-33", [lpuGB1.id], "1972-11-23");
  const d4 = await mkDoctor("Морозова Елена Викторовна", mp1.id, stChP.id, yuzhnouralsk.id, "+7 (908) 555-44-66", [lpuYuzh.id, lpuGB1.id], "1990-02-17");
  const d5 = await mkDoctor("Захаров Павел Олегович", mp1.id, stShtat.id, troitsk.id, "+7 (951) 777-88-99", [lpuPoly2.id], "1983-06-30");
  const d6 = await mkDoctor("Гусева Наталья Андреевна", mp2.id, stIP.id, chelyabinsk.id, "+7 (912) 222-33-44", [lpuGKB5.id], "1987-12-05");
  const d7 = await mkDoctor("Лебедев Артем Сергеевич", mp2.id, stSZ.id, chelyabinsk.id, "+7 (922) 666-77-88", [lpuGKB5.id, lpuUral.id], "1975-03-19");
  const d8 = await mkDoctor("Тихонова Вера Львовна", mp2.id, stChP.id, chelyabinsk.id, "+7 (932) 999-00-11", [lpuUral.id], "1981-08-08");
  const d9 = await mkDoctor("Комаров Станислав Юрьевич", mp2.id, stShtat.id, chelyabinsk.id, "+7 (963) 123-45-67", [lpuGKB5.id], "1969-05-14");

  // —— Специализации врачей (доработка 1.2) ——
  const spec = (name: string) => db.specialization.create({ data: { name } });
  const sNeuro = await spec("Неврология");
  const sTrauma = await spec("Травматология-ортопедия");
  const sTherapy = await spec("Терапия");
  const sNeurosurg = await spec("Нейрохирургия");
  const sRheum = await spec("Ревматология");
  const sCardio = await spec("Кардиология");

  // Специализации НВ + график работы (доработка 1.2)
  const linkSpecs = (doctorId: string, ids: string[], schedule?: string) =>
    db.doctor.update({
      where: { id: doctorId },
      data: {
        workSchedule: schedule ?? null,
        specializations: { create: ids.map((specializationId) => ({ specializationId })) },
      },
    });
  await linkSpecs(d1.id, [sNeuro.id, sTherapy.id], "Пн–Пт, 8:00–14:00");
  await linkSpecs(d2.id, [sNeuro.id], "Пн, Ср, Пт, 9:00–15:00");
  await linkSpecs(d3.id, [sTrauma.id], "Вт, Чт, 10:00–16:00");
  await linkSpecs(d4.id, [sTherapy.id, sCardio.id]);
  await linkSpecs(d5.id, [sNeurosurg.id, sTrauma.id], "Пн–Пт, 15:00–20:00");
  await linkSpecs(d6.id, [sRheum.id]);
  await linkSpecs(d7.id, [sTrauma.id, sNeurosurg.id], "Ср–Вс, 9:00–18:00");
  await linkSpecs(d8.id, [sTherapy.id]);
  await linkSpecs(d9.id, [sNeuro.id, sRheum.id], "Пн–Сб, 8:00–12:00");

  // —— Визиты ——
  const mkVisit = (doctorId: string, lpuId: string, mpId: string, date: Date, purpose: string, status: string, comment?: string) =>
    db.visit.create({ data: { doctorId, lpuId, mpId, date, purpose, status, comment } });

  await mkVisit(d1.id, lpuGB1.id, mp1.id, daysAgo(21), "Знакомство, презентация центра", "CONDUCTED", "Договорились о передаче стопок направлений в регистратуру");
  await mkVisit(d2.id, lpuMedLine.id, mp1.id, daysAgo(14), "Согласование программы лояльности", "CONDUCTED", "Интересует накопительный вариант");
  await mkVisit(d3.id, lpuGB1.id, mp1.id, daysAgo(7), "Передача материалов, брифинг по МРТ суставов", "CONDUCTED");
  await mkVisit(d1.id, lpuGB1.id, mp1.id, daysAhead(3), "Контрольная встреча, сбор обратной связи", "PLANNED");
  await mkVisit(d4.id, lpuYuzh.id, mp1.id, daysAhead(5), "Обучение работы с направлением", "PLANNED", "Взять новые бланки направлений");
  await mkVisit(d5.id, lpuPoly2.id, mp1.id, daysAhead(9), "Презентация «Весь организм»", "PLANNED");
  await mkVisit(d2.id, lpuMedLine.id, mp1.id, daysAgo(2), "Встреча перенесена врачом", "CANCELLED", "Врач на конференции, перезапланировать");
  await mkVisit(d6.id, lpuGKB5.id, mp2.id, daysAgo(10), "Знакомство, презентация центра", "CONDUCTED", "Активно направляет на позвоночник");
  await mkVisit(d7.id, lpuGKB5.id, mp2.id, daysAhead(2), "Согласование реестра на выплату", "PLANNED");
  await mkVisit(d8.id, lpuUral.id, mp2.id, daysAhead(6), "Презентация МРТ брюшной полости", "PLANNED");

  // —— Заявки ——
  const patients = [
    "Петренко И. И.", "Соколова А. В.", "Дмитриев К. Н.", "Николаева М. П.", "Фролов С. С.",
    "Абрамова Т. Ю.", "Белов Г. Д.", "Карпова Е. А.", "Романов В. В.", "Григорьева О. И.",
    "Савельев П. П.", "Титова Н. Н.", "Максимов Д. А.", "Осипова Л. С.", "Виноградов А. К.",
  ];
  const templates: Array<[typeof d1, string, string, string, typeof nBrain, typeof nBrain | null, number]> = [
    [d1, lpuGB1.id, troitsk.id, "МРТ головного мозга", nBrain, nBrain, 46],
    [d1, lpuGB1.id, troitsk.id, "МРТ поясничного отдела", nLumbar, nLumbar, 38],
    [d2, lpuMedLine.id, troitsk.id, "«Весь организм»", nAll, nAll, 12],
    [d2, lpuMedLine.id, troitsk.id, "МРТ шейного отдела", nCervical, nCervical, 27],
    [d3, lpuGB1.id, troitsk.id, "МРТ коленного сустава", nJoint, nJoint, 33],
    [d4, lpuYuzh.id, yuzhnouralsk.id, "МРТ головного мозга", nBrain, nBrain, 19],
    [d4, lpuYuzh.id, yuzhnouralsk.id, "МРТ грудного отдела", nThoracic, nThoracic, 9],
    [d5, lpuPoly2.id, troitsk.id, "МРТ гипофиза", nPituitary, nPituitary, 15],
    [d5, lpuPoly2.id, troitsk.id, "МРТ брюшной полости", nAbd, null, 4],
    [d1, lpuPoly2.id, troitsk.id, "«Причина боли в голове 1»", nHead1, nHead1, 21],
    [d3, lpuGB1.id, troitsk.id, "«Причина боли в позвоночнике 1а»", nSpine1, nSpine1, 30],
    [d4, lpuGB1.id, troitsk.id, "«Причина боли в животе»", nAbdomen, nAbdomen, 7],
    [d6, lpuGKB5.id, chelyabinsk.id, "МРТ поясничного отдела", nLumbar, nLumbar, 41],
    [d6, lpuGKB5.id, chelyabinsk.id, "МРТ малого таза", nPelvis, nPelvis, 25],
    [d7, lpuGKB5.id, chelyabinsk.id, "МРТ головного мозга", nBrain, nBrain, 35],
    [d7, lpuUral.id, chelyabinsk.id, "МРТ шейного отдела", nCervical, nCervical, 17],
    [d8, lpuUral.id, chelyabinsk.id, "МРТ брюшной полости", nAbd, nAbd, 13],
    [d9, lpuGKB5.id, chelyabinsk.id, "МРТ коленного сустава", nJoint, null, 6],
    [d9, lpuGKB5.id, chelyabinsk.id, "«Причина проблем с коленями»", nKnee, nKnee, 22],
    [d6, lpuGKB5.id, chelyabinsk.id, "«Весь организм»", nAll, nAll, 10],
    [d7, lpuGKB5.id, chelyabinsk.id, "МРТ грудного отдела", nThoracic, nThoracic, 28],
    [d8, lpuUral.id, chelyabinsk.id, "МРТ головного мозга", nBrain, nBrain, 5],
    [d9, lpuGKB5.id, chelyabinsk.id, "МРТ поясничного отдела", nLumbar, nLumbar, 44],
    [d2, lpuMedLine.id, troitsk.id, "«Причина боли в голове 1»", nHead1, nHead1, 50],
    [d1, lpuGB1.id, troitsk.id, "МРТ малого таза", nPelvis, nPelvis, 8],
  ];

  for (let i = 0; i < templates.length; i++) {
    const [doc, lpuId, _cityId, _dest, assigned, done, ago] = templates[i];
    // Доработка 1.2: мультиноменклатура — часть заявок с несколькими позициями;
    // «Куда направление» — по умолчанию «МРТ ТОЧНО» (как при незаполненном поле)
    const extraAssigned = i % 5 === 0 ? nPituitary : null;
    const extraDone = i % 7 === 0 ? nCervical : null;
    await db.request.create({
      data: {
        date: daysAgo(ago),
        patientName: patients[i % patients.length],
        doctorId: doc.id,
        lpuId,
        destination: "МРТ ТОЧНО",
        assignedId: assigned.id,
        doneId: done ? done.id : null,
        authorId: doc.mpId ?? mp1.id,
        items: {
          create: [
            { nomenclatureId: assigned.id, kind: "ASSIGNED" },
            ...(extraAssigned ? [{ nomenclatureId: extraAssigned.id, kind: "ASSIGNED" as const }] : []),
            ...(done ? [{ nomenclatureId: done.id, kind: "DONE" }] : []),
            ...(extraDone && done ? [{ nomenclatureId: extraDone.id, kind: "DONE" as const }] : []),
          ],
        },
      },
    });
  }

  // —— Задел под бонусы: примеры проводок (этап 2) ——
  await db.bonusTransaction.create({
    data: { doctorId: d1.id, amount: 500, type: "ACCRUAL", status: "CONFIRMED", note: "Демо-проводка: МРТ головного мозга" },
  });

  console.log("Seed done ✓");
  console.log("MP: m.ivanova / mrtno2026, a.petrov / mrtno2026, Operator: a.sidorova / mrtno2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

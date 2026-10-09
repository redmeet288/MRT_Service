"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Braces,
  Blocks,
  Fingerprint,
  FileDown,
  History,
  Layers,
  Gift,
  Lock,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ==================== Данные: словарь ==================== */

interface FieldDoc {
  f: string;
  t: string;
  d: string;
}
interface EntityDoc {
  entity: string;
  note?: string;
  fields: FieldDoc[];
}

const PK = "UUID PK";
const TS = "DateTime";

const DATA_DICT: EntityDoc[] = [
  {
    entity: "User",
    note: "Пользователи системы: МП (администратор территории) и Операторы",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "login", t: "String · unique", d: "Логин для входа (в нижнем регистре)" },
      { f: "password", t: "String", d: "Хэш пароля (bcrypt)" },
      { f: "name", t: "String", d: "Отображаемое имя" },
      { f: "role", t: "MP | OPERATOR", d: "МП — администратор территории, Оператор — пользователь" },
      { f: "isActive", t: "Boolean · true", d: "Деактивация вместо удаления (вход блокируется)" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
      { f: "→ doctors", t: "связь", d: "Курируемые НВ (у МП)" },
    ],
  },
  {
    entity: "City",
    note: "Справочник городов",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "name", t: "String · unique", d: "Название города" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
      { f: "→ lpus, doctors", t: "связь", d: "ЛПУ и НВ, привязанные к городу" },
    ],
  },
  {
    entity: "Lpu",
    note: "Лечебно-профилактические учреждения",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "name", t: "String", d: "Название (уникально в связке с городом)" },
      { f: "address", t: "String?", d: "Адрес (улица, дом)" },
      { f: "cityId", t: "→ City", d: "Город (FK, удаление ограничено)" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
      { f: "→ doctors (DoctorLpu)", t: "связь M:N", d: "Профили НВ, работающие в ЛПУ" },
    ],
  },
  {
    entity: "Nomenclature",
    note: "Услуги/обследования: поля «Что назначено» и «Что сделано» заявки",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "name", t: "String", d: "Наименование (уникально в связке с категорией)" },
      { f: "category", t: "String · «Обследования»", d: "Категория группировки" },
      { f: "isActive", t: "Boolean · true", d: "Деактивация при использовании в заявках" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "CooperationStatus",
    note: "Статусы сотрудничества с НВ (ИП, СЗ, штат и др.)",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "name", t: "String · unique", d: "Название статуса" },
      { f: "color", t: "String · #7692cb", d: "HEX-цвет для отображения в UI" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "Doctor",
    note: "НВ (направляющий врач) — ключевая сущность CRM. Связь с ЛПУ — через таблицу DoctorLpu (M:N)",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "fullName", t: "String", d: "ФИО врача" },
      { f: "isActive", t: "Boolean · true", d: "Пометка на удаление: исключается из выпадающих списков" },
      { f: "phone", t: "String?", d: "Телефон" },
      { f: "birthDate", t: "DateTime?", d: "Дата рождения" },
      { f: "statusId", t: "→ CooperationStatus?", d: "Статус сотрудничества" },
      { f: "mpId", t: "→ User", d: "Курирующий МП (FK, индекс)" },
      { f: "cityId", t: "→ City?", d: "Город" },
      { f: "comment", t: "String?", d: "Комментарий МП" },
      { f: "bonusType", t: "CASH | ACCUMULATIVE?", d: "Тип бонуса — задел этапа 2 (модуль лояльности)" },
      { f: "bonusBalance", t: "Float · 0", d: "Баланс баллов — задел этапа 2" },
      { f: "payoutDetails", t: "String?", d: "Реквизиты выплаты — задел этапа 2" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "Visit",
    note: "Визиты к НВ — источник календаря МП",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "doctorId", t: "→ Doctor", d: "Врач (FK, каскадное удаление)" },
      { f: "lpuId", t: "→ Lpu?", d: "Место визита" },
      { f: "mpId", t: "→ User", d: "Автор визита (МП)" },
      { f: "date", t: "DateTime", d: "Дата/время визита (индекс)" },
      { f: "purpose", t: "String", d: "Цель визита" },
      { f: "comment", t: "String?", d: "Комментарий" },
      { f: "status", t: "PLANNED | CONDUCTED | CANCELLED", d: "Статус визита" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "Request",
    note: "Заявка — учет направлений. Поле «Сумма» исключено из структуры данных",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "date", t: "DateTime", d: "Дата заявки (индекс)" },
      { f: "patientName", t: "String", d: "ФИО пациента (единственное обязательное поле)" },
      { f: "doctorId", t: "→ Doctor?", d: "Направляющий врач (необязателен, индекс)" },
      { f: "lpuId", t: "→ Lpu?", d: "ЛПУ направления (необязательно, индекс)" },
      { f: "destination", t: "String?", d: "Куда направление" },
      { f: "assignedId", t: "→ Nomenclature?", d: "Что назначено" },
      { f: "doneId", t: "→ Nomenclature?", d: "Что сделано" },
      { f: "authorId", t: "→ User", d: "Автор записи (из сессии)" },
      { f: "bonusAmount", t: "Float?", d: "Начисленный бонус — колонка скрыта, считается журналом проводок (этап 2)" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "BonusTransaction",
    note: "Журнал проводок модуля лояльности (задел этапа 2). Бонусы не считаются «на лету»",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "doctorId", t: "→ Doctor", d: "Врач (FK, каскадное удаление)" },
      { f: "requestId", t: "→ Request?", d: "Связанная заявка" },
      { f: "amount", t: "Float", d: "Сумма проводки" },
      { f: "type", t: "ACCRUAL | WRITEOFF", d: "Начисление / списание" },
      { f: "status", t: "DRAFT | CONFIRMED | PAID", d: "Черновик → подтверждена → выплачена" },
      { f: "note", t: "String?", d: "Примечание" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "ReportPreset",
    note: "Пользовательские пресеты фильтров отчетов",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "userId", t: "→ User", d: "Владелец пресета (каскадное удаление)" },
      { f: "name", t: "String", d: "Название пресета" },
      { f: "reportKey", t: "String · examinations", d: "Ключ отчета" },
      { f: "filtersJson", t: "String (JSON)", d: "Сериализованные фильтры" },
      { f: "createdAt / updatedAt", t: TS, d: "Метки времени" },
    ],
  },
  {
    entity: "AuditLog",
    note: "Журнал аудита — задел под синхронизацию с внешней CRM (п. 9.2 ТЗ)",
    fields: [
      { f: "id", t: PK, d: "Стабильный идентификатор" },
      { f: "userId", t: "→ User?", d: "ID пользователя, выполнившего действие" },
      { f: "userName", t: "String?", d: "Имя пользователя (снимок на момент события)" },
      { f: "action", t: "CREATE | UPDATE | DELETE | EXPORT | IMPORT | LOGIN", d: "Тип действия" },
      { f: "entity", t: "String", d: "Сущность: doctor, request, visit, lpu, city…" },
      { f: "entityId", t: "String?", d: "ID затронутой записи" },
      { f: "details", t: "String?", d: "Описание события" },
      { f: "createdAt", t: TS, d: "Метка времени (индекс)" },
    ],
  },
];

/* ==================== Данные: REST API ==================== */

type Method = "GET" | "POST" | "PUT" | "DELETE";

const METHOD_CLASS: Record<Method, string> = {
  GET: "bg-azure text-white",
  POST: "bg-brand text-white",
  PUT: "bg-sky text-white",
  DELETE: "bg-terra-dark text-white",
};

interface EndpointDoc {
  m: Method;
  p: string;
  d: string;
}
interface GroupDoc {
  title: string;
  endpoints: EndpointDoc[];
}

const API_GROUPS: GroupDoc[] = [
  {
    title: "Аутентификация (NextAuth)",
    endpoints: [
      { m: "POST", p: "/api/auth/signin", d: "Вход по логину/паролю (credentials) — JWT-сессия с uid и ролью" },
      { m: "POST", p: "/api/auth/signout", d: "Выход из системы" },
      { m: "GET", p: "/api/auth/session", d: "Текущая сессия: { user: { uid, name, role } }; срок — 12 часов" },
      { m: "GET", p: "/api/app/*", d: "Все /api/app/* требуют сессию; без нее — 401. Операции удаления словарей — только роль МП" },
    ],
  },
  {
    title: "Справочники",
    endpoints: [
      { m: "GET", p: "/api/app/cities", d: "Города со счетчиками ЛПУ и НВ" },
      { m: "POST", p: "/api/app/cities", d: "Создать город { name }" },
      { m: "DELETE", p: "/api/app/cities?id=", d: "Удалить город — только МП; запрещено, если используется в ЛПУ или у НВ" },
      { m: "GET", p: "/api/app/lpus", d: "ЛПУ с городом, адресом и счетчиками НВ/заявок" },
      { m: "POST", p: "/api/app/lpus", d: "Создать ЛПУ { name, cityId, address? }" },
      { m: "PUT", p: "/api/app/lpus", d: "Обновить ЛПУ { id, name, cityId, address }" },
      { m: "DELETE", p: "/api/app/lpus?id=", d: "Удалить ЛПУ — только МП" },
      { m: "GET", p: "/api/app/nomenclature", d: "Позиции номенклатуры (группируются по category)" },
      { m: "POST", p: "/api/app/nomenclature", d: "Создать позицию { name, category }" },
      { m: "PUT", p: "/api/app/nomenclature", d: "Обновить позицию { id, name, category }" },
      { m: "DELETE", p: "/api/app/nomenclature?id=", d: "Удалить — только МП; при использовании в заявках — деактивация" },
      { m: "GET", p: "/api/app/statuses", d: "Статусы сотрудничества с цветами" },
      { m: "POST", p: "/api/app/statuses", d: "Создать статус { name } (цвет по умолчанию #7692cb)" },
      { m: "DELETE", p: "/api/app/statuses?id=", d: "Удалить статус — только МП" },
    ],
  },
  {
    title: "НВ (направляющие врачи)",
    endpoints: [
      { m: "GET", p: "/api/app/doctors", d: "Список НВ; фильтры: q, mpId, lpuId, statusId, cityId" },
      { m: "POST", p: "/api/app/doctors", d: "Создать НВ { fullName, mpId, phone?, birthDate?, statusId?, cityId?, comment?, lpuIds[] } — доступно и Оператору" },
      { m: "GET", p: "/api/app/doctors/[id]", d: "CRM-карточка НВ: профиль, ЛПУ, визиты, заявки" },
      { m: "PUT", p: "/api/app/doctors/[id]", d: "Обновить НВ (в т.ч. привязку ЛПУ)" },
      { m: "DELETE", p: "/api/app/doctors/[id]", d: "Удалить НВ — только МП (вместе с визитами и заявками)" },
    ],
  },
  {
    title: "Визиты",
    endpoints: [
      { m: "GET", p: "/api/app/visits", d: "Список визитов с врачами и ЛПУ" },
      { m: "POST", p: "/api/app/visits", d: "Создать визит { doctorId, lpuId?, date, purpose, comment? }; mpId — из сессии" },
      { m: "PUT", p: "/api/app/visits/[id]", d: "Обновить визит, в т.ч. статус PLANNED / CONDUCTED / CANCELLED" },
      { m: "DELETE", p: "/api/app/visits/[id]", d: "Удалить визит" },
    ],
  },
  {
    title: "Заявки",
    endpoints: [
      { m: "GET", p: "/api/app/requests", d: "Список заявок (дата, пациент, НВ, ЛПУ, назначено/сделано)" },
      { m: "POST", p: "/api/app/requests", d: "Создать заявку { date, patientName, doctorId?, lpuId?, destination?, assignedIds?, doneIds?, comment? }; обязателен только patientName" },
      { m: "PUT", p: "/api/app/requests/[id]", d: "Обновить заявку (в т.ч. отметка «что сделано»)" },
      { m: "DELETE", p: "/api/app/requests/[id]", d: "Удалить заявку" },
    ],
  },
  {
    title: "Пользователи",
    endpoints: [
      { m: "GET", p: "/api/app/users", d: "Полный список с ролями и счетчиками НВ — только МП; ?basic=1 — краткий список (все роли, для фильтров)" },
      { m: "POST", p: "/api/app/users", d: "Создать { login, name, role, password≥6 } — только МП" },
      { m: "PUT", p: "/api/app/users/[id]", d: "Обновить имя/роль/пароль — только МП" },
      { m: "DELETE", p: "/api/app/users/[id]", d: "Деактивация (не удаление) — только МП; нельзя себя и МП с курируемыми НВ" },
    ],
  },
  {
    title: "Пресеты отчетов",
    endpoints: [
      { m: "GET", p: "/api/app/presets", d: "Пресеты текущего пользователя" },
      { m: "POST", p: "/api/app/presets", d: "Сохранить { name, reportKey, filters }" },
      { m: "DELETE", p: "/api/app/presets/[id]", d: "Удалить свой пресет" },
    ],
  },
  {
    title: "Импорт данных",
    endpoints: [
      { m: "POST", p: "/api/app/import", d: "Массовый импорт { kind: \"lpus\" | \"doctors\", rows[] } → { created, skipped, errors[] }; дубли пропускаются, города/статусы создаются автоматически; фиксируется в аудите" },
    ],
  },
  {
    title: "Дашборд и отчеты",
    endpoints: [
      { m: "GET", p: "/api/app/dashboard", d: "KPI, динамика заявок по неделям, ближайшие визиты, топ НВ" },
      { m: "GET", p: "/api/app/reports/examinations", d: "Отчет «По обследованиям»: дерево МП → ЛПУ → НВ → заявки; экспорт из UI (XLSX/PDF) логируется как EXPORT" },
    ],
  },
  {
    title: "Аудит",
    endpoints: [
      { m: "GET", p: "/api/app/audit?limit=200", d: "Журнал действий (последние N событий) — только МП" },
      { m: "POST", p: "/api/app/audit", d: "Фиксация события { action: EXPORT, entity, entityId?, details? } — защита от несанкционированного экспорта" },
    ],
  },
];

/* ==================== Компонент ==================== */

export function DocsView() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky/40 bg-sky-light/50 p-4 flex items-start gap-3">
        <BookOpen className="h-5 w-5 shrink-0 text-azure mt-0.5" strokeWidth={2} />
        <p className="text-sm text-brand leading-relaxed">
          Техническая документация платформы: словарь данных (структура БД), каталог REST API и
          стандарты интеграции — по п. 9.2 ТЗ. Backend API-first: внешняя CRM может работать с теми же
          эндпоинтами, что и этот интерфейс.
        </p>
      </div>

      <Tabs defaultValue="dictionary" className="space-y-4">
        <TabsList className="bg-white border border-border h-11 p-1 rounded-lg">
          <TabsTrigger value="dictionary" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
            <Database className="h-4 w-4" strokeWidth={2} /> Словарь данных
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
            <Braces className="h-4 w-4" strokeWidth={2} /> REST API
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
            <Blocks className="h-4 w-4" strokeWidth={2} /> Интеграция и форматы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dictionary"><DictionaryTab /></TabsContent>
        <TabsContent value="api"><ApiTab /></TabsContent>
        <TabsContent value="integration"><IntegrationTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* —— Вкладка 1: словарь данных —— */
function DictionaryTab() {
  return (
    <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-white p-5 space-y-5 pr-2">
      {DATA_DICT.map((e) => (
        <div key={e.entity}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-display text-sm font-bold text-brand">{e.entity}</h3>
            {e.note && <span className="text-[11px] text-muted-foreground">{e.note}</span>}
          </div>
          <div className="mt-2 rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/60">
                  <TableHead className="w-44 text-xs">Поле</TableHead>
                  <TableHead className="w-48 text-xs">Тип</TableHead>
                  <TableHead className="text-xs">Описание</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.fields.map((row) => (
                  <TableRow key={row.f}>
                    <TableCell className="text-xs font-mono font-semibold text-azure py-2">
                      {row.f}
                    </TableCell>
                    <TableCell className="text-xs text-brand py-2">{row.t}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2">{row.d}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* —— Вкладка 2: REST API —— */
function MethodBadge({ m }: { m: Method }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent w-16 justify-center font-mono font-bold text-[10px] shrink-0",
        METHOD_CLASS[m]
      )}
    >
      {m}
    </Badge>
  );
}

function ApiTab() {
  return (
    <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
      {API_GROUPS.map((g) => (
        <Card key={g.title} className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
          <CardContent className="p-4">
            <h3 className="font-display text-sm font-bold text-brand mb-3">{g.title}</h3>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {g.endpoints.map((ep) => (
                <div
                  key={`${ep.m} ${ep.p}`}
                  className="flex items-start gap-3 px-3 py-2.5 bg-white"
                >
                  <MethodBadge m={ep.m} />
                  <code className="text-xs font-mono font-semibold text-brand w-full sm:w-56 xl:w-72 sm:shrink-0 break-all leading-5">
                    {ep.p}
                  </code>
                  <span className="text-xs text-muted-foreground leading-5">{ep.d}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <Card className="rounded-xl border-border bg-soft">
        <CardContent className="p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 shrink-0 text-terra-dark mt-0.5" strokeWidth={2} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Права доступа: операции <b className="text-brand">DELETE</b> словарей (города, ЛПУ,
            номенклатура, статусы), управление пользователями и чтение журнала аудита — только роль{" "}
            <b className="text-brand">МП</b>. Создание НВ, визитов и заявок доступно и{" "}
            <b className="text-brand">Операторам</b>. Все мутации фиксируются в журнале аудита.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* —— Вкладка 3: интеграция и форматы —— */
function IntegrationTab() {
  return (
    <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
          <CardContent className="p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light mb-3">
              <Fingerprint className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-brand">UUID-идентификаторы</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Все ключевые сущности (User, City, Lpu, Nomenclature, Doctor, Visit, Request,
              BonusTransaction, AuditLog) несут стабильные UUID вместо инкрементальных ID — записи
              переносятся между системами без коллизий, обеспечивая бессшовную интеграцию с внешней CRM.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
          <CardContent className="p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light mb-3">
              <FileDown className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-brand">Экспорт / импорт данных</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Backend API-first: обмен данными — через REST (JSON). Из интерфейса отчеты выгружаются в
              XLSX и PDF, начальная база ЛПУ и НВ загружается массовым импортом из Excel/CSV по
              стандартизированным шаблонам. Каждый экспорт логируется в аудите.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
          <CardContent className="p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light mb-3">
              <History className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-brand">Аудит изменений</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Журнал AuditLog хранит каждое изменение ключевых сущностей, удаление и экспорт с меткой
              времени (timestamp) и ID пользователя (userId) — полная трассируемость действий и основа
              для синхронизации инцидентов с внешней CRM.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
          <CardContent className="p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light mb-3">
              <Layers className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-brand">Разделение слоев</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Фронтенд не содержит бизнес-логики: валидация, права и расчеты выполняются на бэкенде.
              Будущая CRM (или мобильный клиент) может подключиться к тем же REST-эндпоинтам без
              дублирования правил.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Модуль лояльности (этап 2) */}
      <Card className="rounded-xl border-dashed border-terra/60 bg-terra-light/40">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-terra-light">
              <Gift className="h-4 w-4 text-terra-dark" strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-brand">Модуль лояльности (этап 2)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div className="rounded-lg bg-white border border-border p-3">
              <p className="text-xs font-semibold text-azure-dark">Тип А — денежный бонус</p>
              <p className="text-xs text-muted-foreground mt-1">
                Начисления формируют реестр на выплату: проводки со статусом PAID попадают в платежную
                ведомость (payoutDetails — реквизиты врача).
              </p>
            </div>
            <div className="rounded-lg bg-white border border-border p-3">
              <p className="text-xs font-semibold text-azure-dark">Тип Б — накопительный</p>
              <p className="text-xs text-muted-foreground mt-1">
                Баллы копируются на счете врача (bonusBalance) и списываются по заявкам врача —
                проводки типа WRITEOFF.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Таблица <code className="text-xs font-mono font-semibold text-azure">BonusTransaction</code>{" "}
            со статусами <code className="font-mono text-brand">DRAFT → CONFIRMED → PAID</code> уже
            присутствует в схеме БД. Бонусы считаются отдельным журналом проводок с аудитом, а не
            «на лету» из заявок: поле Request.bonusAmount — только витринное значение, колонка в UI
            скрыта до запуска этапа 2.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

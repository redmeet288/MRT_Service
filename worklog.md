# Worklog — Корпоративное веб-приложение «МРТ ТОЧНО» (CRM направляющих врачей)

Проект: Internal Tool по ТЗ 2.0.docx + гайдлайн бренда «МРТ ТОЧНО».
Стек: Next.js 16 (App Router), TypeScript, Tailwind 4, shadcn/ui, Prisma/SQLite, NextAuth v4, TanStack Query, Zustand.

---
Task ID: 1
Agent: orchestrator (main)
Task: Инициализация проекта, установка зависимостей, план работ

Work Log:
- Изучены ТЗ (upload/ТЗ 2.0.docx) и гайдлайн (upload/ГАЙДЛАЙН МРТ ТОЧНО.pdf)
- Зафиксированы брендовые токены: #194688 (основной), #0196d2 (акцент), #7692cb (доп), #e8a486 (теплый), #fbfbfb (фон); шрифты Arimo (акцент) / Cygre (основной, fallback Montserrat)
- Проверена структура проекта Next.js 16 + shadcn/ui

Stage Summary:
- План: схема БД → auth → API → дизайн-система → views (параллельные сабагенты 7-a/7-b/7-c) → интеграция → браузерная верификация
- Все ключевые сущности (User, City, Lpu, Nomenclature, Doctor, Visit, Request, BonusTransaction) получают UUID PK (@default(uuid())) — задел под интеграцию с внешней CRM

---
Task ID: 2-5
Agent: orchestrator (main)
Task: Фундамент системы — БД, авторизация, API, дизайн-система, каркас

Work Log:
- Prisma-схема: User (MP/OPERATOR), City, Lpu, Nomenclature, CooperationStatus, Doctor (НВ, с полями задела бонусов: bonusType, bonusBalance, payoutDetails), DoctorLpu (M:N), Visit, Request, BonusTransaction (задел), ReportPreset, AuditLog. Все PK — UUID.
- db:push + seed: 3 пользователя (2 МП, 1 оператор), 3 города, 6 ЛПУ, 13 позиций номенклатуры, 4 статуса, 9 НВ, 10 визитов, 25 заявок. Пароль всем: mrtno2026.
- NextAuth v4 (credentials, JWT, роли в сессии). middleware удален (Next 16 proxy-конвенция; 401-защита реализована в каждом роуте через requireAuth).
- API /api/app/*: cities, lpus, nomenclature, statuses (CRUD, DELETE только МП), doctors (+карточка), visits, requests, users, presets, import (НВ/ЛПУ), dashboard, reports/examinations (дерево МП→ЛПУ→НВ→заявки), audit (журнал + фиксация экспортов). Удаление словарей — только МП (ТЗ п.2).
- Дизайн-система: globals.css с бренд-токенами (#194688 brand, #0196d2 azure, #7692cb sky, #e8a486 terra, #fbfbfb soft), шрифты Arimo (акцент) + Montserrat (фолбэк Cygre), паттерн дуг, кастомный скроллбар.
- Логотип: SVG-эмблема (арка+концентрические дуги+фигура человека) LogoMark/LogoFull, favicon.
- Каркас: app-shell (сайдбар #194688 + шапка + sticky footer), store/ui (Zustand), providers (TanStack Query), login-view (сплит-лейаут с паттерном), registry вьюх + заглушки.
- Общие компоненты: shared/ui-bits (SectionCard, EmptyState, DeleteButton, StatusChip, fmtDate/fmtDateTime, RowsSkeleton).
- Проверено: lint чистый; вход m.ivanova/mrtno2026 → сессия с ролью MP → /api/app/cities отдает данные (UUID); /api/app/cities без сессии → 401.

Stage Summary:
- Готов фундамент. Сабагентам 7-a/7-b/7-c передаются заглушки: doctors-view, requests-view | calendar-view, reports-view | import-view, users-view, audit-view, docs-view.
- Контракт для вьюх: api-client (api.get/post/put/del, qs), types, ui-bits, sonner toast, react-query, бренд-классы bg-azure/text-brand/bg-sky/terra.

---
Task ID: 7-a
Agent: full-stack-developer
Task: Вьюхи «Направляющие врачи (НВ)» и «Заявки» — CRM-сущности с полным CRUD

Work Log:
- Изучен фундамент: types.ts, api-client.ts, ui-bits.tsx, dashboard/dictionaries-view (паттерны), store/ui, API-роуты (doctors, requests, visits, users) — сверены контракты query-параметров и тел запросов.
- doctors-view.tsx: панель фильтров (поиск по ФИО, Select МП/статус/ЛПУ/город, «Сбросить»), сетка карточек xl:grid-cols-3 (ФИО, статус-бейдж цветом из status.color, МП, чипы ЛПУ, телефон, счетчики заявок/визитов, кнопка «Карточка»), «Добавить врача» (bg-azure, доступно обеим ролям).
- Диалог создания/редактирования НВ (sm:max-w-2xl): ФИО*, телефон, дата рождения, статус, МП* (только role=MP из users?basic=1), город, множественный выбор ЛПУ чекбоксами (автоподстановка города первого ЛПУ при пустом городе), комментарий; POST/PUT /api/app/doctors, invalidate ["doctors"].
- CRM-карточка (sm:max-w-4xl): шапка (ФИО, статус, МП, телефон, ДР, город) + quick-stats (всего заявок / выполнено doneId!=null / ближайший PLANNED-визит), удаление врача в шапке только для МП. Tabs: «Профиль и привязки» (+ кнопка Редактировать + секция задела placeholder-section «Бонусная программа (этап 2)» с бейджем «Задел» и disabled-полями bonusType/bonusBalance/payoutDetails); «Визиты и коммуникации» — таймлайн desc, inline-форма планирования (POST /api/app/visits, status PLANNED), смена статуса Проведен/Отменен (PUT /api/app/visits/[id]), удаление визита только МП; «Заявки (N)» — компактная таблица + кнопка «К заявкам» → setActiveView("requests").
- requests-view.tsx: фильтры (период from/to, НВ, ЛПУ, МП, ToggleGroup Все/Невыполненные done=0/Выполненные done=1), таблица max-h-96 sticky-шапка (дата, пациент, НВ+МП, ЛПУ+город, куда направление, что назначено, что сделано или бейдж «Ожидает» terra, автор, Pencil обеим ролям, удаление только МП).
- Диалог заявки строго по ТЗ (7 полей по порядку, поля «Сумма» нет): дата (по умолчанию сегодня), ФИО пациента*, ФИО НВ*, ЛПУ с автоподстановкой из карточки НВ (1 привязка — readonly авто; несколько — Select из привязок; 0 — свободный Select из всех ЛПУ; город показывается автоматически), куда направление, что назначено* (nomenclature?active=1), что сделано (опционально); POST/PUT /api/app/requests.
- Исправлен линт react-hooks/set-state-in-effect: диалоги монтируются условно ({open && <Dialog/>}), состояние формы инициализируется в useState-инициализаторе (initDoctorForm/initRequestForm) вместо useEffect.
- Проверки: bun run lint — 0 ошибок; tsc — в моих файлах только известный project-wide нюанс typing session.user.role (идентичен фундаменту app-shell/dictionaries, в рантайме роль приходит из JWT-колбэка); dev.log — GET / 200 без ошибок; curl-смоук API (doctors с фильтрами, requests?done=0, users?basic=1, doctors/[id], nomenclature?active=1) — 200, форма ответа совпадает с types.ts.

Stage Summary:
- Разделы «Направляющие врачи» и «Заявки» полностью функциональны: CRUD НВ с множественными привязками к ЛПУ, CRM-карточка с таймлайном визитов и заявками, регистрация/редактирование направлений с автоподстановкой ЛПУ/города из карточки НВ.
- Ролевая модель соблюдена: удаление НВ/заявок/визитов и смена статуса визитов — только МП; создание НВ и заявок, редактирование заявок — обеим ролям.
- Задел этапа 2 (бонусная программа) выведен в карточке НВ неактивным блоком (dashed border, disabled-поля).
- Решение по формам: диалоги монтируются только в открытом состоянии — чистая инициализация без useEffect (требование react-hooks/set-state-in-effect), потеря анимации закрытия принята как трейд-офф.

---
Task ID: 7-c
Agent: full-stack-developer
Task: Вьюхи Import / Users / Audit / Docs (массовый импорт, управление пользователями, журнал действий, документация API)

Work Log:
- Изучены контекст (worklog), конвенции (types, api-client, ui-bits, dashboard/dictionaries views), Prisma-схема и реальные роуты /api/app/* (users, import, audit, cities, doctors, visits, requests, presets) для точной документации.
- import-view.tsx: вкладки «ЛПУ»/«Врачи (НВ)», стилизованная drop-зона (label + dashed border + Upload), парсинг на клиенте XLSX.read(arrayBuffer)/sheet_to_json(header:1) — заголовки нормализуются (trim+lowercase), валидация обязательных колонок (ЛПУ: name+city; НВ: fullName+mpLogin) с понятной ошибкой; превью первых 8 строк + «и ещё N»; маппинг в формат API (toApiRow) → POST /api/app/import → бейджи «Создано/Пропущено (дубли)/Ошибок» + список ошибок в terra-light блоке; кнопка «Скачать шаблон» — XLSX.utils.aoa_to_sheet + writeFile (shablon-lpu.xlsx / shablon-nv.xlsx) с 2 примерами строк; карточка-подсказка по каждой колонке (обязательность, автосоздание городов/статусов/ЛПУ); после успеха qc.invalidateQueries() (все зависимые данные).
- users-view.tsx: гейт по роли через useSession (не МП → EmptyState «Доступно только МП»); таблица Имя+логин / Роль (МП — bg-brand, Оператор — bg-sky) / Курируемых НВ (_count.doctors, только для МП) / Статус (Активен — azure, Деактивирован — terra-light) / действия; диалог создания (Логин*, Имя*, Роль Select, Пароль* ≥6, KeyRound-иконка) → POST /api/app/users; редактирование (имя, роль, пароль опционально — пусто = не менять) → PUT /api/app/users/[id]; деактивация — DeleteButton с текстом «Деактивировать…» → DELETE (свой аккаунт скрыт от деактивации, сервер страхует).
- audit-view.tsx: гейт только МП; GET /api/app/audit?limit=200; клиентские фильтры Select «Сущность» (10 значений + «— все» через служебный ALL, т.к. Radix Select не допускает "") и «Действие» (CREATE/UPDATE/DELETE/EXPORT/IMPORT); таблица max-h-96 sticky header: Время (fmtDateTime), Пользователь, Действие (бейджи: CREATE azure / UPDATE sky / DELETE terra / EXPORT brand / IMPORT terra-dark), Сущность (outline + короткий entityId в title), Детали (truncate + title); пояснение про задел синхронизации с внешней CRM.
- docs-view.tsx: 3 вкладки. «Словарь данных» — 11 сущностей (User, City, Lpu, Nomenclature, CooperationStatus, Doctor, Visit, Request, BonusTransaction, ReportPreset, AuditLog) с колонками Поле|Тип|Описание, вручную перенесены из schema.prisma (UUID PK, bonusType/bonusBalance/payoutDetails — «задел этапа 2», bonusAmount — скрытая витринная колонка и т.п.), всё в max-h-96 overflow-y-auto. «REST API» — 10 групп эндпоинтов с метод-бейджами (GET azure / POST brand / PUT sky / DELETE terra-dark), пути и описание сверенены с фактическим кодом роутов (DELETE ?id= для словарей, [id] для карточек), права: DELETE словарей/пользователей/аудит — только МП. «Интеграция и форматы» — 4 карточки (UUID, экспорт/импорт JSON/XML+XLSX/PDF+Excel/CSV, аудит изменений, разделение слоев) + dashed-блок «Модуль лояльности (этап 2)»: тип А (реестр на выплату) / тип Б (накопительный со списанием), BonusTransaction DRAFT→CONFIRMED→PAID, проводки вместо расчета «на лету».
- Проверки: bun run lint — 0 ошибок; GET / → 200, компиляция чистая; tail dev.log — ошибок компиляции по новым файлам нет (warning про middleware в логе — устаревший, файл удален ранее).

Stage Summary:
- Реализованы 4 финальные вьюхи — все заглушки registry закрыты, клиентская часть ТЗ п.8 (импорт) и п.9.2 (документация) готова.
- Решения: парсинг Excel/CSV полностью на клиенте (xlsx уже в зависимостях), нормализация заголовков к lowercase для устойчивости к регистру; фильтрация аудита на клиенте (200 записей); в Select-фильтрах использован служебный ALL вместо пустой строки (ограничение Radix); деактивация пользователя через переиспользованный DeleteButton с кастомным текстом диалога; docs-view — статические данные, синхронизированные с фактической реализацией API (сверены методы всех 20 роут-файлов).

---
Task ID: 7-b
Agent: full-stack-developer
Task: Вьюхи «Календарь визитов» (calendar-view) и «Отчеты» (reports-view) — полная замена заглушек

Work Log:
- Изучен контекст: types.ts, api-client, ui-bits, образцы стиля (dashboard/dictionaries), контракты API (visits, visits/[id], reports/examinations, presets, presets/[id], users?basic=1, doctors, audit).
- calendar-view.tsx: переключатель месяц/неделя (ToggleGroup), навигация ‹ › + «Сегодня» (date-fns, weekStartsOn:1, ru-локаль); фильтры МП (users?basic=1, только роль MP) / статус / врач (doctors, опции фильтруются по выбранному МП); GET visits по периоду сетки (from по начало недели месяца, to до конца дня).
- Сетка месяца: 7 колонок Пн–Вс, дни вне месяца приглушены (bg-soft), сегодня — ring-azure + bg-sky-light/50 + бейдж числа; чипы визитов: PLANNED bg-azure / CONDUCTED bg-brand / CANCELLED bg-terra (текст белый), максимум 3 чипа + «+N ещё»; клик по чипу → редактирование, клик по дню → создание с предзаполненной датой.
- Сетка недели: 7 колонок min-h-[400px], карточки (врач, цель, ЛПУ, StatusChip), кнопка «Добавить» в каждой колонке; легенда статусов под сеткой.
- Диалог визита: НВ* (Select), ЛПУ (опции из привязок выбранного врача, sentinel «none»), Дата* (type=date), Цель*, Комментарий (Textarea), Статус (default PLANNED); POST/PUT visits; удаление — только МП (useSession + DeleteButton); invalidateQueries ["visits","dashboard"], toast sonner.
- reports-view.tsx: панель фильтров (период -90д/сегодня по умолчанию, МП, ЛПУ, НВ (зависит от МП), «Что назначено» (nomenclature?active=1), выполненность Все/1/0) + пресеты: Popover-список (применение через JSON.parse filtersJson, DeleteButton) + диалог сохранения → POST presets {name, reportKey:"examinations", filters}.
- Дерево отчета — контролируемый аккордеон на useState<Set> (3 уровня раскрытия, НЕ Radix Accordion): МП → ЛПУ (+город) → НВ → компактная таблица заявок (Дата, Пациент, Куда, Назначено, Сделано); строки-заголовки bg-sky-light/50, ChevronRight rotate-90 transition, counters справа (font-display), % бейдж с градацией azure/sky/terra; верхний итог: всего/выполнено/% + «Сформирован: …».
- Экспорт: перед каждым — await POST /api/app/audit {action:"EXPORT", entity:"report", details «N строк, период, формат»}; Excel — XLSX json_to_sheet + writeFile «otchet-po-obsledovaniyam.xlsx» (МП|ЛПУ|Город|НВ|Дата|Пациент|Куда|Назначено|Сделано, !cols ширины); PDF — jsPDF landscape + autoTable, та же плоская таблица, кириллица транслитерируется функцией translit (map а-я→a-ya, с сохранением регистра) — «otchet-po-obsledovaniyam.pdf»; toast.success после.
- Задел этапа 2: Switch «Колонка „Начисленный бонус"» disabled с подписью «Этап 2 · бонусная система» и мутной иконкой Coins; в таблице деталей колонка бонуса не выводится (тип ReportRequestRow.bonus поддержан).
- Проверка браузером (agent-browser): вход m.ivanova → календарь (месяц/неделя, чипы, диалоги, создание визита POST 201, удаление с аудитом) → отчеты (раскрытие дерева, Excel-файл скачан, заголовки/данные кириллицей корректны, PDF скачан, пресет сохранен/применен/удален, аудит EXPORT в журнале) → удаление тестовых данных.
- Финальные фиксы по ревью: session role через типизированный cast (Role), лпу-фолбэк при редактировании без TS-нареканий, Select врача всегда controlled (value="" — Radix показывает placeholder, подтверждено исходниками radix), DialogDescription в диалогах (a11y). tsc/eslint по моим файлам — чисто; dev.log — «✓ Compiled», ошибок нет.

Stage Summary:
- Готовы 2 вьюхи: «Календарь визитов» (месяц/неделя, CRUD визитов с ролевым удалением МП) и «Отчеты» (иерархический конструктор с экспортом Excel/PDF, аудитом экспортов и пресетами фильтров).
- Решения: период запроса визитов шире видимой сетки (включая дни соседних месяцев); «to» всегда до 23:59:59 для включительности; sentinel-значения в Select («ALL», «none») из-за запрета пустых value в Radix; транслитерация только для PDF (Excel/XLSX — нативная кириллица); audit-логирование выполняется до формирования файла и не блокирует выгрузку при сбое.
- Замечание для оркестратора: в doctors-view/requests-view остались pre-existing ошибки eslint (react-hooks/set-state-in-effect) и tsc (session?.user?.role) — вне зоны задачи 7-b, файлы не трогал по правилам.

---
Task ID: 8-9
Agent: orchestrator (main)
Task: Интеграция, финальная линтовка и браузерная верификация

Work Log:
- Lint: 0 ошибок на весь проект (после интеграции вьюх 7-a/7-b/7-c)
- Agent Browser E2E: вход m.ivanova (МП) → дашборд (KPI 9 НВ / 6 ЛПУ / 18 заявок / 4 визита, график, топ НВ, ближайшие визиты, последние заявки) → Врачи (сетка карточек, статусы, ЛПУ-чипы) → CRM-карточка (профиль, вкладки, история визитов, задел бонусов) → Заявки (создание заявки E2E: выбор НВ → авто/ручной выбор ЛПУ (2 привязки → ручной выбор сработал) → POST 201 → запись в БД → список 26) → Календарь (месяц, чипы статусов azure/brand/terra, сегодня подсвечен) → Отчеты (дерево МП→ЛПУ→НВ→заявки развернуто, итоги 25/23/92%, Excel-экспорт скачан, EXPORT записан в аудит, пресеты) → Справочники → Пользователи → Журнал действий (виден CREATE/DELETE заявки, EXPORT отчета) → Документация → Импорт
- Роли: оператор a.sidorova — в навигации нет Пользователей/Журнала; в справочниках нет кнопок удаления; API 403 на DELETE city / GET audit / POST users (серверная защита подтверждена)
- Верстка: footer sticky (mt-auto) подтвержден на длинных и коротких страницах; 768px — деградация корректная (desktop-first по ТЗ)
- Тестовая заявка удалена после проверки; браузер закрыт

Stage Summary:
- Все разделы ТЗ реализованы и верифицированы в браузере. Приложение готово к использованию: вход m.ivanova / mrtno2026 (МП), a.petrov / mrtno2026 (МП), a.sidorova / mrtno2026 (Оператор).

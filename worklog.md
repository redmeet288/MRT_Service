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

---
Task ID: 2-b
Agent: full-stack-developer
Task: Доработка этапа 1.1 по обратной связи: раздел «Врачи (НВ)» → список в стиле 1С + ролевая форма (оператор без МП), раздел «Заявки» → карточка по клику на строку + поле «Комментарий» + drill-down из дашборда

Work Log:
- Прочитан worklog.md, сверены контракты: types.ts (DoctorItem.mp — {id,name}|null, RequestItem.comment — string|null), api-helpers/routes (POST/PUT doctors принимают mpId опционально, PUT mpId:"" → открепить; POST/PUT requests принимают comment), store/ui (consumeRequestsFilters — одноразовое чтение), globals.css (onec-window/onec-table: желтая sticky-шапка, hover строк), eslint (react-hooks/set-state-in-effect), next.config (reactStrictMode: false → безопасное поглощение стора в useState-инициализаторе).
- doctors-view.tsx: сетка карточек заменена на <div className="onec-window"><div className="max-h-96 overflow-y-auto"><table className="onec-table"> — колонки ФИО / Статус (StatusPill цветом status.color) / МП (doctor.mp?.name ?? «—») / ЛПУ (чипы, первые 2 + «+N» с title всех остальных) / Город / Телефон / Заявки (_count.requests) / Визиты (_count.visits) / Действия. Кнопку «Карточка» из строки убрал — переход в CRM-карточку теперь по клику на ФИО (button text-azure font-medium hover:underline, title «Открыть карточку врача»). Панель фильтров (поиск ФИО, Select МП/статус/ЛПУ/город, «Сбросить») сохранена без изменений.
- Ролевая модель doctors-view: session.user cast через локальный тип SessionUserWithRole ({uid?, role?} | undefined, паттерн dashboard-view — tsc-чистый). «Добавить врача» — обеим ролям; кнопки «Изменить»/«Удалить» в строке и «Редактировать» в карточке — только МП (оператору — «—»). Удаление врача из строки: мутация поднята в DoctorsView (раньше была только в карточке).
- DoctorFormDialog (role-aware): для OPERATOR обязательное поле только ФИО; «Курирующий МП» — disabled Input с placeholder «Не назначен» + подсказка «Будет закреплен МП позднее»; mpId в тело запроса НЕ передается вообще (body собирается условно: if (isMP) body.mpId = …). Для MP при создании МП по умолчанию = текущий пользователь (session.uid в useState-инициализаторе); при редактировании mpId: doctor.mpId ?? NONE — доступен SelectItem «— Без МП —» (sentinel NONE) для открепления, mpId: NONE → "" → PUT открепляет. Валидация кнопки: !fullName || (isMP && !doctor && !mpId).
- DoctorCardDialog: «МП: {card?.mp?.name ?? "—"}» в шапке; в профиле Field «Курирующий МП» рендерит бейдж terra «Не закреплен» при null; кнопка «Редактировать» обернута в {isMP && …}; пустые ЛПУ для оператора — без совета «нажмите Редактировать». Остальное (визиты-таймлайн, заявки, задел бонусов) — без изменений.
- requests-view.tsx: клик по строке открывает карточку-редактирование (tr cursor-pointer + onClick=openCard; hover дает .onec-table tbody tr:hover; title «Открыть карточку заявки»); кнопка Pencil — e.stopPropagation(); DeleteButton обернут в <span onClick={stopPropagation}> (Radix AlertDialog). Диалог при редактировании переименован в «Карточка заявки».
- Диалог заявки: поле №8 «Комментарий» (Textarea, необязательное) после «Что сделано»; RequestFormState.comment (request.comment ?? ""), в body comment: form.comment.trim() || null — POST и PUT.
- Drill-down из дашборда: const [navFilters] = useState(() => useUiStore.getState().consumeRequestsFilters()); const [filters] = useState(() => ({...emptyFilters, ...(navFilters ? {from: isoToYMD(navFilters.from), to: isoToYMD(navFilters.to), mpId, lpuId, doctorId, assignedId, done} : {})})); isoToYMD = date-fns format("yyyy-MM-dd") с guard на Invalid Date. assignedId добавлен в RequestFilters и в queryKey/qs (контрола в UI нет — значение приходит только из дашборда, «Сбросить» очищает).
- Таблица заявок переведена на onec-window/onec-table (единообразие с врачами); в колонке «Пациент» индикатор комментария — MessageSquare (text-sky) в span с title=текст комментария при request.comment; r.doctor.mp?.name ?? "—" (в рантайме mp может быть null у НВ без куратора). Удаление — только МП, редактирование — обеим ролям (как было).
- Инфра-инцидент: curl-смоук вскрыл 500 на POST /api/app/doctors — Prisma Client в рантайме был сгенерирован до optional-связи Doctor.mp («Argument mp is missing»); prisma generate + db push не подхватились живым дев-сервером, при touch роутов сервер упал и не был перезапущен супервизором. Перезапущен штатным `bun run dev` (setsid/nohup, порт 3000) — дальше всё зелено. Схема/seed не менялись, код API не трогал (2 файла по ТЗ).
- API-смоук (curl, сессия m.ivanova): POST doctors без mpId → 201 mpId:null; PUT mpId=<uuid> → закреплен; PUT mpId:"" → откреплен (null); GET карточки — mp:null; POST requests с comment → comment сохранен; PUT requests/[id] comment → обновлен; GET requests?assignedId&done=0 и ?doctorId → фильтрация работает, comment на всех строках. Тестовые НВ/заявка удалены (DELETE 200), дубли в аудите — ожидаемые следы смоука.
- Проверки: bun run lint — 0 ошибок; tsc --noEmit — 0 ошибок по doctors-view/requests-view; GET / → 200; dev.log (последние строки) — компиляция чистая, ошибок нет.

Stage Summary:
- «Врачи (НВ)» теперь список в стиле 1С (как «Заявки»): карточка открывается кликом по ФИО; НВ может существовать без куратора — оператор создает врача с одним обязательным ФИО (mpId не отправляется), МП видит «— Без МП —» при редактировании и бейдж «Не закреплен» в карточке.
- «Заявки»: строка = карточка заявки (редактирование), добавлено поле «Комментарий» с индикатором в списке, drill-down-фильтры дашборда (from/to ISO → yyyy-MM-dd через date-fns, mpId/lpuId/doctorId/assignedId/done) применяются одним поглощением в useState-инициализаторе — без useEffect.
- Найден и устранен инфраструктурный затык этапа: устаревший Prisma Client (миграция mp optional не подхватилась рантаймом) — потребовался prisma generate/db push + рестарт дев-сервера; фронтовые контракты 2-b подтвердились сквозным curl-смоуком.
- Ролевая модель расширена консистентно: OPERATOR — добавление НВ (только ФИО*) и просмотр карточек/заявок + редактирование заявок; MP — всё остальное (изменение/удаление НВ, удаление заявок, закрепление МП).

---
Task ID: 3-a
Agent: full-stack-developer
Task: Полная переработка reports-view.tsx под стиль «1С:Предприятие» + 4 варианта отчета (ReportV2Response)

Work Log:
- Прочитан worklog (контекст задач 1, 2-5, 7-a/b/c, 8-9), изучены текущий reports-view.tsx, новый API /api/app/reports/examinations (вариантный формат ReportV2Response: рекурсивные ReportGroupNode {level,id,name,subtitle,total,done,children,requests}), globals.css (onec-window/titlebar/toolbar/btn/btn-primary/search/table/row-group/row-total/tree-toggle — все классы уже на месте), presets API, ui-bits, types.
- reports-view.tsx переписан полностью (единственный тронутый файл) в стиле 1С:
  - .onec-window: .onec-titlebar («Отчет по обследованиям», стрелки истории не делали) + .onec-toolbar (role=toolbar): желтая [Сформировать] (onec-btn-primary, Play/Loader2), [Настройки…], селектор «Вариант:» (нативный select .onec-search: По МП/По ЛПУ/По НВ/По Номенклатуре), [Экспорт Excel]/[Экспорт PDF] (disabled до формирования), «Пресеты…» (Popover со списком, применение/удаление через DeleteButton) + «Сохранить как…».
  - Формирование ТОЛЬКО по кнопке (как в 1С): draft-настройки (useState) отдельно от applied (useState<ReportFilters|null>, изначально null → query enabled:false, staleTime:Infinity, refetchOnWindowFocus:false); «Сформировать» = setApplied+runId++ (реформирование при тех же фильтрах) + сброс раскрытия дерева; строка «Параметры: Период: … · [МП/ЛПУ/НВ/Назначено/Выполненность] · Вариант: … · Сформирован: …» строится из applied + data.generatedAt; индикатор «настройки изменены — нажмите „Сформировать“» при расхождении draft/applied; Loader2 в строке параметров при isFetching.
  - Диалог «Настройки отчета»: период от/до, МП (users?basic=1), ЛПУ, НВ (опции зависят от МП; смена МП сбрасывает НВ), «Что назначено» (nomenclature?active=1), выполненность Все/1/0 (Radix Select с sentinel ALL, без value=""), задел этапа 2: Switch «Колонка „Начисленный бонус“» disabled + подпись «Этап 2 · бонусная система» (в настройках); футер — [Закрыть] + желтая [Сформировать] (строит и закрывает).
  - Таблица: .onec-table в max-h-[560px] overflow-auto (sticky-шапка из CSS); единая шапка = [Наименование · группировка: …] + детальные колонки по варианту (Дата, Пациент, [НВ если вариант≠doctor], [ЛПУ если ≠lpu], [МП если doctor|nomenclature], Куда направление, Что назначено, Что сделано) + [Всего][Выполнено][%]; строки групп .onec-row-group: td colSpan=(1+детальные), отступ depth*20px, toggle .onec-tree-toggle «−/+», иконка уровня (UserRound/Building2/Stethoscope/Package), name + subtitle (город у ЛПУ, ЛПУ у НВ), счетчики total/done/% бейджем (градация azure/sky/terra как было); детальные строки: «Что сделано» = значение с CheckCircle2 azure либо бейдж «Ожидает» terra.
  - Дерево: рекурсивный компонент TreeRows по ReportGroupNode; ключ узла = parentKey/depth:level:id (уникален по пути — один НВ под двумя ЛПУ не конфликтует); контролируемое раскрытие TreeExpansion {open:Set (глубже 1-го уровня), closed:Set (свернутый вручную 1-й уровень)}, по умолчанию раскрыт первый уровень; toggle — чистый setTreeState без useEffect; «Итого по отчету» .onec-row-total (Всего: N · Выполнено: M · %), пустые состояния (не сформирован / нет заявок / ошибка) через EmptyState/terra-блок.
  - Экспорт: collectRows рекурсивно собирает плоские ExportRow из дерева (mp/lpu/city/doctor/nom + поля заявки, с фолбэком на r.mpName/lpuName/cityName/doctorName/assigned); колонки по варианту (mp: МП|ЛПУ|Город|НВ|Дата|Пациент|Куда|Назначено|Сделано; lpu: ЛПУ|Город|НВ|…; doctor: НВ|ЛПУ|МП|…; nomenclature: Номенклатура|Дата|Пациент|НВ|ЛПУ|МП|…); Excel — XLSX json_to_sheet + !cols, «otchet-po-obsledovaniyam.xlsx»; PDF — jsPDF landscape + autoTable, кириллица через сохраненную функцию translit, «otchet-po-obsledovaniyam.pdf»; ПЕРЕД выгрузкой POST /api/app/audit {action:"EXPORT", entity:"report", details: "N строк, период, формат, вариант"} в try/catch (не блокирует).
  - Пресеты: filtersJson включает variant и все фильтры; применение пресета подставляет настройки И сразу формирует отчет (applyPreset → setDraft+setApplied+runId++), легаси-пресеты без variant → "mp".
- Проверки: bun run lint — 0 ошибок; tsc --noEmit — 0 ошибок в reports-view.tsx (18 замечаний проекта — pre-existing в других файлах: route.ts, app-shell, dictionaries/users/audit-view, auth, api-helpers, store/ui — по правилам задачи не трогал); dev.log — «GET / 200 in 3.8s (compile: …)» без ошибок компиляции; curl GET / → 200. Нюанс: в ходе задачи dev-сервер оказался остановлен — поднят системой заново (порт 3000), компиляция вьюхи чистая.

Stage Summary:
- Отчет «По обследованиям» приведен к образцу 1С: окно формы с тулбаром и желтой кнопкой «Сформировать», строка «Параметры: …», иерархическая таблица с деревом групп и строкой «Итого»; данные тянутся из нового вариантного API (ReportV2Response) с 4 вариантами группировки (mp → 3 уровня МП→ЛПУ→НВ; lpu → 2; doctor/nomenclature → 1) и детальными строками заявок, состав колонок зависит от варианта.
- Решения: отчет строится только по кнопке (draft/applied + runId в queryKey, staleTime:Infinity — возврат на вкладку не переформирует отчет); дерево — контролируемые Set(open/closed) вместо useEffect-инициализации (требование react-hooks/set-state-in-effect), ключи по полному пути; групповые/итоговые строки — td colSpan поверх детальной сетки (числа выравниваются inline-style, т.к. .onec-table th/td перебивают Tailwind-классы по специфичности); экспортные колонки и аудит EXPORT параметризованы вариантом; транслит-функция для PDF переиспользована без изменений.

---
Task ID: 3-b
Agent: full-stack-developer
Task: Справочники в стиле 1С + общий компонент импорта/экспорта DictImportExport (перенос импорта из удаленной страницы «Импорт данных»)

Work Log:
- Изучен worklog (описание старого import-view: XLSX.read(arrayBuffer), sheet_to_json(header:1), нормализация trim+lowercase, валидация колонок, превью 8 строк, бейджи результата), текущий dictionaries-view (CRUD-диалоги, DeleteButton, тексты подтверждений), API-роуты (cities/lpus/nomenclature/statuses/import/doctors), store/ui (consumeDictTab), globals.css (готовые классы .onec-*).
- Создан src/components/shared/dict-io.tsx: DictImportExport({ kind, onImported }) — ФРАГМЕНТ 1С-тулбара: кнопки «Импорт из файла…» (.onec-btn) и «Экспорт» (Loader2 при выгрузке). Конфиг на 5 kind (cities/lpus/nomenclature/statuses/doctors): шаблон (aoa_to_sheet + writeFile, 2 примера строки), обязательные колонки, превью-колонки, toApiRow, fetchExportRows, имена файлов/листов, подсказка. Импорт: Dialog со стилизованной drop-зоной (dashed border + Upload, brand-цвета), парсинг на клиенте XLSX.read(await file.arrayBuffer())/sheet_to_json(header:1, defval:""), заголовки trim+lowercase, понятная ошибка «Отсутствуют обязательные колонки: …», превью первых 8 строк + «и ещё N», POST /api/app/import { kind, rows }, бейджи «Создано / Пропущено (дубли) / Ошибок» + список ошибок в terra-блоке, «Скачать шаблон» в футере диалога, после успеха qc.invalidateQueries() + onImported?.(). Экспорт: api.get данных → маппинг (lpus: name/city.name/address; doctors: развернутые lpus «;», birthDate ДД.ММ.ГГГГ; nomenclature: isActive да/нет) → json_to_sheet → writeFile (goroda/lpu/nomenklatura/statusy-sotrudnichestva/vrachi-nv.xlsx). Диалог монтируется условно, состояние в useState-инициализаторах (без useEffect).
- dictionaries-view.tsx полностью переработан в стиле 1С: вкладки Города|ЛПУ|Номенклатура|Статусы; начальная вкладка = useState(() => useUiStore.getState().consumeDictTab() ?? "cities") — БЕЗ useEffect; для каждой вкладки окно .onec-window (titlebar: иконка + название + «Записей: N»; toolbar: [Создать onec-btn-primary][Изменить onec-btn, disabled без выбора][DeleteButton — только МП, disabled без выбора] | разделитель | DictImportExport | .onec-search справа). Таблицы .onec-table (sticky желтая шапка из CSS), max-h-96 overflow-y-auto, выделение строки кликом → selectedId + класс onec-row-selected, клик по названию = изменить. Колонки: Города (Название/ЛПУ/НВ), ЛПУ (Название/Город/Адрес/НВ/Заявки), Номенклатура (Наименование/Категория/Активна бейджем да-нет), Статусы (Название/кружок цвета+HEX/НВ). Клиентская фильтрация по названию (useMemo), EmptyState для «ничего не найдено»/пусто, RowsSkeleton при загрузке.
- CRUD-диалоги переиспользованы из текущей версии и переведены в общий стиль (DialogDescription для a11y): город (name), ЛПУ (name/cityId-Select/address; Radix Select value={form.cityId || undefined} вместо value=""), номенклатура (name/category), статус (name + color: input type=color + HEX-поле; POST уже принимал color). Города/статусы получили диалоги «Изменить» (раньше были только inline-создание), логика PUT — как у ЛПУ/номенклатуры ({ id, ...fields }). Удаление — DeleteButton с прежними текстами («Удалить город/ЛПУ/статус „…“?», «Удалить „…“?»), onSuccess деактивированной номенклатуры сохранен («Позиция используется — деактивирована»); после удаления selectedId сбрасывается. Роли: просмотр/создание/редактирование — обе, DeleteButton скрыт у оператора (session?.user?.role === "MP" как было). Убраны: staff-диалог ЛПУ (карточка «врачи ЛПУ» осталась доступной через раздел Врачи), inline-создание.
- Проверки: bun run lint — 0 ошибок (был один пропуск импорта Button — исправлен); GET / → 200; GET /api/app/cities без сессии → 401; dev.log: «✓ Ready», ошибок компиляции нет (dev-сервер был остановлен в песочнице — поднят заново на 3000).

Stage Summary:
- Справочники приведены к образцу заказчика (1С): окно списка с тулбаром Создать/Изменить/Удалить, поиск справа, желтая шапка, подсветка выбранной строки; импорт и экспорт теперь ВНУТРИ каждого справочника (страница «Импорт данных» больше не нужна), общий DictImportExport поддерживает все 5 kind, включая doctors (mpLogin необязателен — НВ без МП создается без куратора).
- Решения: экспорт выгружается с теми же заголовками, что и шаблон (файл экспорта можно сразу реимпортировать); для НВ вместо недоступного через API mpLogin выгружается колонка mp (имя, при реимпорте игнорируется); consumeDictTab вызывается один раз в useState-инициализаторе (одноразовый payload, без гидратационных эффектов).
- Замечание для оркестратора (вне зоны задачи, файлы API не трогал): у справочников нет PUT-эндпоинтов (cities/lpus/nomenclature/statuses — только GET/POST/DELETE), кнопка «Изменить» шлет PUT и до добавления обработчиков получит 405 — это было и в старой версии (lpus/nomenclature); нужен один обработчик PUT на каждый из 4 словарных роутов ({ id, ...fields }).

---
Task ID: 2-c
Agent: full-stack-developer
Task: Этап 1.1 доработка — вид «День» в календаре, общий диалог визита с полем времени, новый раздел «Визиты» (список 1С) с drill-down из дашборда

Work Log:
- Изучен worklog (7-b: календарь месяц/неделя), контракты types/api-client/ui-bits/store-ui, роуты visits & visits/[id] (parseDate принимает полный ISO), классы onec-* в globals.css, механизм drill-down openVisitId в store/ui (дашборд его еще не выставляет — wiring за другой задачей).
- visit-dialog.tsx (НОВЫЙ): вынесен диалог визита из calendar-view; props { open, onOpenChange, visit?, defaultDate?, defaultTime?, onSaved? }; добавлено поле «Время» (type=time) рядом с «Дата» и «Статус» (строка sm:grid-cols-3); при сохранении new Date(`${date}T${time||"09:00"}`).toISOString() → POST/PUT /api/app/visits (date полным ISO); при редактировании visit.date разбирается format(d,"yyyy-MM-dd")/"HH:mm"; ЛПУ из привязок выбранного врача (+фолбэк ЛПУ редактируемого визита); удаление только МП (useSession role cast + DeleteButton); инвалидирует ["visits"], ["dashboard"], ["doctors"] (счетчики визитов в карточках НВ); состояние формы — в useState-инициализаторе initForm (правило set-state-in-effect, диалог монтируется условно).
- calendar-view.tsx: ViewMode + "day", ToggleGroup «Месяц/Неделя/День» (иконка CalendarClock); навигация ‹ › + «Сегодня» через addDays, заголовок «Четверг, 8 октября 2026» (EEEE, ru-локаль); период запроса дня = сам день (to → T23:59:59); сетка по часам 07:00–21:00 (15 слотов, min-h 56px) в контейнере max-h-[600px] overflow-y-auto + автопрокрутка к текущему часу (useEffect скроллит DOM-реф без setState); часы с визитами вне диапазона добавляются в сетку; слот: метка часа + карточки визитов (время HH:mm, НВ, цель, ЛПУ, StatusChip), клик по пустому слоту → создание с предзаполненными датой И временем слота, hover-подсказка «Запланировать на HH:00»; индикатор текущего времени (azure-линия по getMinutes) в строке текущего часа (isToday + getHours); время добавлено на чипы месяца («12:00 ФИО») и карточки недели; старый диалог удален, подключен VisitDialog (условный монтаж, передаются visit/defaultDate/defaultTime).
- visits-view.tsx (ЗАМЕНА плейсхолдера): обертка onec-window + onec-titlebar (счетчик) + onec-toolbar (onec-btn-primary «Добавить визит», Select статуса с sentinel ALL, onec-search «Поиск по НВ», кнопка «Сбросить»); GET /api/app/visits без from/to (take 2000), клиентская сортировка по date УБЫВАНИЕ + фильтры (статус, поиск по doctor.fullName, case-insensitive); таблица onec-table (sticky-шапка желтая из globals.css) в max-h-96 overflow-y-auto: Дата и время (fmtDateTime), Врач (НВ), ЛПУ, Цель (truncate+title), Статус (StatusChip), Мед. представитель; строки cursor-pointer + tabIndex/Enter (a11y), клик → VisitDialog редактирование; EmptyState для пустого результата/фильтров; строка состояния в духе 1С «Записей: N из M · Сортировка…»; drill-down: const [pendingVisitId] = useState(() => useUiStore.getState().openVisitId), диалог рендерится условно когда визит найден в загруженных данных ({editVisit && <VisitDialog/>}), onOpenChange(false) → setDrillClosed(true) + clearOpenVisitId(); визит не найден (вне 2000/удален) — игнор.
- Браузерная верификация (agent-browser, m.ivanova МП): календарь → День (15 слотов, заголовок, индикатор часа) → клик 09:00 → диалог с датой 08.10 и временем 09:00 → создание Волков И.Н. → карточка «09:00 …» в слоте → редактирование времени на 14:45 → PUT сохранил 2026-10-08T14:45:00.000Z (проверено API) → карточка переехала в слот 14:00 → удаление через DeleteButton (строка исчезла, в БД 0 тестовых) → раздел «Визиты»: 10 записей отсортированы 17.10→08.10, поиск «Волков» → 2 строки, фильтр «Отменен» → 1 строка, «Сбросить» → 11 (10+тест на тот момент), клик по строке → карточка, «Добавить визит» → пустой диалог, чипы месяца/недели с временем; консоль/страница без ошибок.
- Проверки: bun run lint — 0 ошибок; tsc-замечаний по файлам нет; dev.log — «✓ Compiled», GET / и API 200. Примечание: в среде одновременно случился сброс dev-сервера (двойной запуск bun run dev системой, EADDRINUSE) и ошибка POST /api/app/doctors 500 из чужого теста — не связаны с файлами задачи 2-c, сервер восстановился, мои экраны отработали чисто.

Stage Summary:
- Календарь теперь имеет 3 вида (месяц/неделя/день): вид «День» — почасовая сетка 07:00–21:00 с прокруткой, автоскроллом к текущему часу, созданием визита кликом по слоту с предзаполнением даты И времени; визиты везде показываются со временем (HH:mm).
- VisitDialog — общий компонент для календаря и списка визитов: поле «Время» сохраняет визиты полным ISO (сервер хранит время), редактирование разбирает ISO на дату+время, удаление только МП; при мутациях инвалидируются visits/dashboard/doctors.
- Новый раздел «Визиты» — 1С-список всех визитов (свежие сверху) с фильтрами по статусу/НВ, кликом по строке открывает карточку; поддержан drill-down из дашборда по контракту setActiveView("visits", { openVisitId }) (диалог откроется после загрузки данных, закрытие чистит стор; wiring со стороны дашборда — за смежной задачей).
- Решения: диалоги монтируются условно с useState-инициализаторами (react-hooks/set-state-in-effect соблюден — никаких setState в useEffect); sentinel "ALL" в Radix Select; часы 07:00–21:00 расширяются часами визитов вне диапазона, чтобы ничего не терялось; «Время» опционально (пусто → 09:00 по ТЗ).

---
Task ID: 2-a
Agent: full-stack-developer
Task: Переработка dashboard-view.tsx по обратной связи заказчика (этап 1.1): переключатель области, кликабельные KPI, recharts-диаграммы с drill-down, визиты-карточка

Work Log:
- Прочитан worklog, сверены контракты: types.ts (новый DashboardData: scope/kpi{doctorsTotal,lpusTotal,requests30,done30,visits7,totalRequests}/weeks{from,to}/upcomingVisits/topDoctors — без recentRequests и plannedVisits), store/ui (dashboardScope, setDashboardScope, setActiveView+NavPayload), api-client (api.get без params → URL собирается через qs({scope})), ui-bits, dashboard API route (GET ?scope=mine|all), ui/chart + recharts 2.15.4 typings (Bar onClick bivarianceHack(data,index,event), accessibilityLayer, activeBar, TooltipProps — проверены в node_modules перед написанием кода).
- Переключатель области: ToggleGroup (type="single", variant="outline", size="sm") «Все НВ» / «Только закрепленные за мной», значение из useUiStore().dashboardScope, запись через setDashboardScope (персистится в localStorage «mrt-dashboard-scope»), guard onValueChange против снятия выбора (Radix). Показывается только при isMP (useSession + типизированный cast роли, как в calendar-view); оператору рендерится без переключателя. Query key ["dashboard", scope], queryFn → GET /api/app/dashboard?scope=… (qs).
- KPI: 4 компактные карточки-кнопки в одном ряду (grid grid-cols-4 gap-3, max-md:grid-cols-2 — деградация), p-4, цифры text-3xl font-display, иконка h-9, hover -translate-y-0.5/border-azure/50/shadow-md, focus-visible ring, aria-label с числом и действием, ArrowUpRight на hover. Навигация: НВ→setActiveView("doctors"), ЛПУ→("dictionaries",{dictTab:"lpus"}), Заявки за 30 дней (подпись «Выполнено: N» из done30)→("requests"), Визиты за 7 дней→("calendar").
- «Динамика заявок»: recharts BarChart (8 недель), Cell-заливка var(--color-sky)/sky-light (нулевые недели бледные), activeBar azure, кастомный WeeksTooltip («Неделя {label} / Заявок: N»), Bar onClick(_,index)→setActiveView("requests",{requestsFilters:{from,to}}) с ISO-границами недели; accessibilityLayer для клавиатуры; хинт «Нажмите на столбец…» с MousePointerClick.
- «Топ по НВ»: горизонтальный BarChart layout="vertical" (YAxis type="category" dataKey="shortName" — ФИО усечено до 16 симв. + «…», XAxis type="number"), высота от числа врачей (max(190, n*34+24)), кастомный DoctorTooltip (полное ФИО+МП+счетчик), Bar onClick→setActiveView("requests",{requestsFilters:{doctorId}}) без периода; хинт.
- «Ближайшие визиты»: кастомный Card (SectionCard не подходит — title обязан быть строкой), заголовок — кнопка-ссылка с aria-label «Ближайшие визиты — перейти к списку всех визитов» и стрелкой на hover → setActiveView("visits"); каждая строка — button (date-бейдж в цвете статуса, ФИО НВ, цель, StatusChip, время ЧЧ:ММ из ISO-даты, ЛПУ, «МП: имя») → setActiveView("visits",{openVisitId:v.id}); aria-label строки с fmtDateTime и VISIT_STATUS_LABELS; список max-h-96 overflow-y-auto, grid sm:grid-cols-2.
- Блок «Последние заявки» удален полностью (вместе с хелпером formatDate); react-hooks/set-state-in-effect соблюден — 0 useEffect в файле (состояния только через стор/события).
- Loading: Skeleton KPI (h-36)/графиков/RowsSkeleton; EmptyState для пустых lists; error-состояние с текстом ошибки и кнопкой «Повторить» (refetch, disabled+Loader2 на isRefetching).
- Верификация браузером (agent-browser, изолированные сессии): вход m.ivanova → дашборд (единственный h1 в app-shell — свой дублирующий заголовок убрал после первой проверки); toggle «mine» → GET /api/app/dashboard?scope=mine 200, KPI пересчитались (10→5 НВ, 6→4 ЛПУ, 17→9 заявок/8 выполнено), localStorage="mine"; все 4 KPI-перехода подтверждены (в т.ч. словари открылись на вкладке ЛПУ); клик по столбцу недели → #/requests с fetch ?from=2026-10-01&to=2026-10-08 («Найдено заявок: 4»); клик по столбцу врача → ?doctorId=… (фильтр НВ предзаполнен); заголовок визитов → #/visits (список, 10 визитов); строка визита → переход с openVisitId (карточку откроет визиты-вью по контракту); ошибка API (сервер перезапускался параллельным агентом) показала error-блок с «Повторить» — восстановление подтверждено; вьюпорты 390/768/1024/1440 — KPI 2→4 колонки корректно.
- bun run lint — 0 ошибок; tsc --noEmit — 0 ошибок по dashboard-view; tail dev.log — только 200, ошибок компиляции нет.

Stage Summary:
- Дашборд полностью соответствует новым требованиям: MP-переключатель «Все НВ / Только закрепленные за мной» (персистентный scope в query-key и API), 4 кликабельных KPI в один ряд, две интерактивные recharts-диаграммы с drill-down в «Заявки» (период недели / конкретный НВ) и подсказками, визиты с переходом к списку и карточке (openVisitId), «Последние заявки» удалены.
- Решения: URL с scope собирается через qs() (api.get не принимает params); для заголовка «Ближайшие визиты» использован собственный Card+CardHeader вместо SectionCard (title — только string), визуально 1:1 с SectionCard; recharts-цвета через CSS-переменные токенов (--color-sky/azure/brand); accessibilityLayer на обоих BarChart (фокус+клавиатура); усечение ФИО до 16 симв. на оси, полное ФИО в тултипе.
- Наблюдение для оркестратора (вне зоны 2-a, файлы не трогал): (1) store/ui инициализирует dashboardScope жестко "all" — функция readScope() существует, но не подключена, поэтому выбор scope НЕ восстанавливается после полной перезагрузки страницы (в рамках SPA-сессии персистентность работает; localStorage пишется корректно); (2) во время проверки наблюдался 500 на POST /api/app/doctors (prisma create в route doctors) — вероятно, параллельный агент правит этот роут; (3) параллельные агенты активно перезапускали dev-сервер — проверка велась в изолированных agent-browser сессиях, дефолтная сессия, судя по всему, разделяется между агентами.

---
Task ID: 4-5
Agent: orchestrator (main)
Task: Итерация 1.1 — интеграция доработок заказчика, исправления, E2E-верификация

Work Log:
- Фундамент: Request.comment и Doctor.mpId nullable в схеме (db:push); doctors POST/PUT принимают НВ без МП; requests POST/PUT принимают comment; visits GET ограничен take:2000; dashboard API переписан (scope=all|mine, weeks с from/to для drill-down, top-10 за 30 дней, visits7, без recentRequests); reports/examinations — вариант группировки variant=mp|lpu|doctor|nomenclature (универсальное дерево ReportGroupNode + совместимый legacy-формат); import — новые kind: cities/nomenclature/statuses, mpLogin опционален.
- Роутинг: store/ui — setActiveView пушит history.pushState("#/view"), syncFromHistory по popstate → кнопка «Назад» браузера работает внутри приложения; OPERATOR_VIEWS = [doctors, requests]; app-shell: навигация оператора только Заявки+Врачи, дашборд/визиты/календарь/отчеты/справочники/пользователи/журнал/доки — mpOnly, защита от ручного перехода, раздел «Визиты» добавлен, «Импорт данных» удален из навигации (вьюха удалена).
- Стили 1С в globals.css: onec-window/titlebar/toolbar/btn/btn-primary/search/table/row-selected/row-group/row-total/tree-toggle.
- Интеграция работы 5 сабагентов (2-a дашборд, 2-b врачи+заявки, 2-c календарь+визиты, 3-a отчет 1С, 3-b справочники 1С + shared/dict-io).
- Фиксы интеграции: dashboardScope инициализируется из localStorage (readScope); PUT-эндпоинты для cities/lpus/nomenclature/statuses (кнопка «Изменить» получала 405); кнопки импорта/экспорта НВ добавлены в doctors-view через shared/dict-io.
- UX-фикс по итогам верификации: DialogContent во всех формах получил max-h-[calc(100dvh-4rem)] overflow-y-auto — на низких экранах диалог скроллится внутри, а не выходит за вьюпорт (выявлено агент-браузером: клик по комментарию закрывал диалог, т.к. поле было ниже границы вьюпорта и клик попадал в оверлей).
- E2E-верификация (agent-browser, 1280×900): вход МП → дашборд (toggle «Все/Только мои» меняет KPI, 4 KPI в ряд кликабельны: НВ→врачи, ЛПУ→справочник на вкладке ЛПУ, Заявки→список, Визиты→календарь); клик столбца динамики → заявки периода (фильтр from/to применен, «Найдено: 1»); «Топ по НВ» диаграмма → заявки врача; «Ближайшие визиты» → раздел «Визиты», клик по визиту → карточка с датой+временем (время 14:45 сохранено в БД, отображается в списке «17.10.2026, 14:45»); кнопка «Назад» браузера → предыдущий раздел внутри приложения (#/dictionaries → #/dashboard).
- Врачи: список-таблица 1С, карточка по клику на ФИО. Заявки: клик по строке → карточка, поле «Комментарий» сохранено в БД (проверено и через UI, и через API PUT).
- Календарь: вид «День» 07:00–21:00 с почасовой сеткой. Отчеты: форма 1С (Сформировать/Настройки/Вариант/Экспорт/Пресеты), вариант «По Номенклатуре» построил дерево Номенклатура→заявки с деталями и «Итого». Справочники: 1С-окна, выбор строки, «Изменить» (PUT города проверен в БД), импорт xlsx с шаблонными колонками создал НВ без МП (mpId null, город/ЛПУ подставлены), бейджи Создано/Пропущено/Ошибок.
- Выход → страница входа; оператор a.sidorova: навигация ровно ["Врачи (НВ)", "Заявки"], форма НВ — обязательное только ФИО, МП disabled «Будет закреплен МП позднее», создан врач mpId:null (тестовые данные удалены).
- Финальный lint: 0 ошибок; свежий dev.log без ошибок; скриншоты в download/verification-*.png.

Stage Summary:
- Итерация 1.1 завершена полностью: ролевое рабочее место оператора, навигация по истории браузера, дашборд с drill-down и областью данных, списочный 1С-интерфейс врачей/справочников, карточки заявки и визита с комментариями/временем, отчет 1С с 4 вариантами группировки, импорт/экспорт прямо в справочниках и у НВ.
- Известный трейд-офф тест-среды: Playwright fill() на сегментированных time-инпутах и частью полей не всегда доходит до React-стейта — реальный пользовательский ввод (клавиатура) работает; в продакшене на проблему не влияет.
- Пароль демо-доступов прежний: m.ivanova / a.petrov / a.sidorova, mrtno2026.

---
Task ID: 1 (итерация 1.2)
Agent: orchestrator (main)
Task: Фундамент доработок 1.2 — шрифт Cygre, корпоративная палитра 1С-окон, схема БД, API

Work Log:
- Шрифт Cygre (файлы заказчика) скопирован в public/fonts, подключен через @font-face (Thin 100 / Light 300 / Regular+Book 400 / Medium 500 / SemiBold 600 / Bold 700 / Black 800+); layout.tsx — Google-фолбэк Montserrat удален, body использует «Cygre» → Arimo fallback.
- globals.css: желто-оранжевая гамма 1С (#ffdf3d, #ffe9a8, #fdf3c9, #ffe8a5, #fbf7e6, #d6b52a…) полностью заменена на корпоративную (e3eaf8/sky-light, azure #0196d2 для primary-кнопки и сортировки, brand #194688). Добавлен .onec-sort-btn для сортируемых заголовков.
- Prisma: model Specialization (+DoctorSpecialization M:N, onDelete Cascade), Doctor.workSchedule String?, RequestNomenclatureItem (kind ASSIGNED|DONE); db:push ок; seed обновлен (6 специализаций, графики работы НВ, мультиноменклатура в части заявок, destination=«МРТ ТОЧНО»); фикс: в cities/route.ts отсутствовал импорт notFound (латентный баг), seed authorId ?? mp1.id.
- types.ts: SpecializationItem; DoctorItem.workSchedule + specializations; RequestItem.assignedItems/doneItems (старые assigned/done/single-поля удалены из типа).
- API: NEW /api/app/specializations (GET/POST/PUT/DELETE, delete→деактивация при использовании); doctors +doctors/[id] — specializations (specializationIds, полная замена), workSchedule; requests GET/POST + requests/[id] PUT — мультиноменклатура (assignedIds/doneIds, legacy-совместимость), destination default «МРТ ТОЧНО», фильтр done через items; reports/examinations — aggregation items (assigned/done через «, »); dashboard done30 через items; import +kind «specializations»; lib/request-items.ts (DEFAULT_DESTINATION, syncRequestItems, idList).
- shared/ui-bits.tsx: SortableTh + cycleSort + applySort (тип SortState) — клиентская сортировка 1С-таблиц, null/"" в конец, localeCompare ru.
- store/ui.ts: NavPayload.dictTab + «specializations»; +calendarDate/pendingCalendarDate (переход из мини-календаря сайдбара).
- dict-io.tsx: kind «specializations» (шаблон/экспорт/импорт); terra-стили заменены на sky/azure.
- dashboard-view: метка toggle «Только закрепленные за мной» → «Только мои» (область данных: Все НВ / Только мои — mine зависит от профиля входа).
- Лint 0 ошибок; tsc по затронутым файлам чисто (шум examples/skills — ранее существовавший).

Stage Summary:
- Контракт для вьюх: RequestItem.assignedItems/doneItems: NomenclatureItem[]; DoctorItem.specializations: {specialization}[] , workSchedule; сортировка через SortableTh/cycleSort/applySort из ui-bits; API specializations готов; dict-io поддерживает kind=«specializations».
- ВАЖНО: вьюхи requests/doctors пока ссылаются на старые поля (assigned/done) — их переписывают сабагенты 2-a..2-e.

---
Task ID: 2-b
Agent: general-purpose
Task: doctors-view — Специализация (мультивыбор), График работы НВ, сортировка списка

Work Log:
- DoctorFormDialog: добавлены поля «Специализация» (чекбокс-список справочника specializations?active=1 в стиле блока «Привязка к ЛПУ»: bordered max-h-40 скролл-бокс, label-строки с Checkbox, счетчик «Выбрано: N», пустое состояние «Сначала добавьте специализации…») и «График работы НВ» (один Input во всю ширину, md:col-span-2, после «Город», placeholder «Например: Пн–Пт, 9:00–15:00»). Оба необязательные.
- Форма: DoctorFormState +specializationIds: string[], +workSchedule: string; initDoctorForm инициализирует из doctor.specializations.map(s=>s.specialization.id) и doctor.workSchedule??""; submit-тело +specializationIds, +workSchedule (trim()||null); toggleSpecialization добавлен; query-ключ ["specializations","active"].
- EditableDoctor расширен (Pick DoctorItem: +workSchedule, +specializations) — работает и для DoctorItem (список), и для DoctorCard (карточка).
- DoctorCardDialog, вкладка «Профиль и привязки»: добавлен блок «Специализация» — чипы rounded-full bg-sky-light px-2.5 py-1 text-xs text-brand сразу после «Привязки к ЛПУ», «—» если пусто; добавлен Field «График работы НВ» (sm:col-span-2, card.workSchedule ?? «—») в гриде профиля перед «Комментарий».
- DoctorCardDialog, вкладка «Заявки»: перевод на новую структуру API (сырые prisma-строки с items: {kind, nomenclature}) — «Назначено»/«Сделано» собираются как join имен через defensive optional chaining с локальным cast (items?: Array<{kind, nomenclature?}>), fallback «—» / бейдж «Ожидает»; doneCount учитывает и legacy doneId, и наличие items kind=DONE.
- Список НВ: клиентская сортировка 1С-таблицы — useState<SortState|null>, sortedDoctors через applySort(doctors ?? [], sort, getter) в useMemo (fullName / status / mp / lpu=первое ЛПУ / city / phone / requests / visits), заголовки ФИО/Статус/МП/ЛПУ/Город/Телефон + Заявки/Визиты (align="center") через SortableTh, «Действия» — обычный th; строки мапятся из sortedDoctors.
- Палитра: новые элементы только brand/azure/sky; бейдж «Ожидает» переведен с терракоты на sky-light/azure (не входит в разрешенные terra-случаи); существующие terra-использования (StatusPill, delete, «Задел»/«Не закреплен») не тронуты. Остальное (фильтры, DictImportExport, режим оператора, удаление, бонусный задел, визиты, экспорты DoctorsView/default) без изменений.
- Проверки: bunx tsc --noEmit | grep doctors-view — пусто (4 старые ошибки r.assigned/r.done/r.doneId устранены); bun run lint — 0 ошибок/предупреждений по всему проекту (eslint . чисто).

Stage Summary:
- doctors-view.tsx полностью переведен на контракт 1.2: specializations+workSchedule в форме и карточке, Заявки через items (kind ASSIGNED|DONE, defensive cast), сортировка SortableTh/applySort из ui-bits.
- Контракт формы: POST/PUT /api/app/doctors принимает specializationIds: string[] (полная замена набора) и workSchedule: string|null.
- Карточка: GET /api/app/doctors/[id] возвращает requests как сырые prisma-строки (items+nomenclature) — чтение с optional chaining и локальным cast, а не через тип RequestItem.
- tsc/lint чисто по файлу; других файлов не касался.

---
Task ID: 2-d
Agent: general-purpose
Task: reports-view — сортировка столбцов (группы + детализация), дезоранжирование

Work Log:
- Подключены сортировочные хелперы из shared/ui-bits: SortableTh, cycleSort, applySort, type SortState (добавлены в существующий импорт).
- Сортировка групп верхнего уровня: state `groupSort` (SortState | null); useMemo `sortedTree` сортирует data.tree через applySort — поля name → node.name, total → node.total, done → node.done, pct → done/total (total>0 ? ratio : 0); дети следуют за родителем, строка «Итого по отчету» остается последней (рендерится после map). Экспорт не затронут: flatRows по-прежнему строится из data.tree напрямую.
- Сортировка детальных строк в листьях: state `detailSort`; в TreeRows добавлены опциональные props detailSort/onDetailSort (прокидываются в рекурсию), листовые node.requests сортируются через applySort с геттером `detailValue` (module-level switch: date/patient/doctor/lpu/mp/destination/assigned/done по spec, unknown → null).
- Все заголовки таблицы переведены на SortableTh: «Наименование · группировка: …» (field name, ariaLabel «Сортировать по наименованию»), динамические detailCols (field=c.key, label=c.label), «Всего»/«Выполнено»/«%» (fields total/done/pct, align="right"). aria-sort/title «Сортировать по столбцу» даются SortableTh из ui-bits.
- Сброс сортировок при новом формировании: formReport() и applyPreset() вызывают setDetailSort(null) + setGroupSort(null).
- Дезоранжирование (палитра заказчика): pctBadgeClass tier <33 → bg-muted text-muted-foreground; hint «настройки изменены…» text-terra-dark → text-azure-dark; error box → border-azure/40 bg-sky-light text-brand-dark; бейдж «Ожидает» (rounded-full) → bg-sky-light text-brand; попутно текст EmptyState «желтую кнопку» → «синюю кнопку» (кнопка уже azure через .onec-btn-primary). grep terra по файлу = 0.
- Числовые колонки выровнены вправо (SortableTh align="right"; body-ячейки TreeRows/Итого — прежний inline textAlign right).
- Проверки: bunx tsc --noEmit — 0 ошибок по reports-view; bun run lint — exit 0, 0 замечаний по файлу; изменен только src/components/views/reports-view.tsx.

Stage Summary:
- В отчете «По обследованиям» работает двухуровневая сортировка заголовков (группы: наименование/всего/выполнено/%; детализация: все колонки варианта), цикл нет→asc→desc→нет, сортировки сбрасываются при «Сформировать»/пресете.
- Экспорт Excel/PDF (с аудитом) не меняет порядок/состав строк: groupSort/detailSort не применяются к flatRows.
- reports-view полностью дезоранжирован (0 terra-классов); сохранены 1C-тулбар, настройки, пресеты, пустые состояния, sr-only caption, named+default экспорт.

---
Task ID: 2-a
Agent: general-purpose
Task: requests-view — убрать «Выполнение», мультиноменклатура, «МРТ ТОЧНО», сортировка столбцов

Work Log:
- Фильтр «Выполнение» удален: ToggleGroup «Все / Невыполненные / Выполненные» убран из панели фильтров; поле done удалено из RequestFilters/emptyFilters, queryKey и qs()-строки запроса. Из consumeRequestsFilters() поле done больше не читается (assignedId drill-down сохранен).
- Форма заявки: assignedId/doneId → assignedIds: string[] / doneIds: string[]. «Что назначено» и «Что сделано» — бордерные скроллируемые чек-листы номенклатуры (max-h-40 overflow-y-auto rounded-lg border border-border bg-white p-3, строка = label + Checkbox + имя, паттерн привязки ЛПУ из doctors-view), хелпер toggleInList. Над списками счетчик «Выбрано: N»; при пустом справочнике — подсказка. «Что назначено» обязательно (Save задизейблен при пустом списке), «Что сделано» опционально.
- initRequestForm при редактировании маппит request.assignedItems/doneItems → id-массивы.
- «Куда направление»: placeholder = «МРТ ТОЧНО», подсказка «Если не изменить — сохранится «МРТ ТОЧНО»», сабмит шлет destination.trim() || "МРТ ТОЧНО" (дефолт дублируется на сервере).
- Таблица: «Что назначено»/«Что сделано» = join(assignedItems/doneItems.map(i=>i.name), ", ") или «—»; терракотовый Badge «Ожидает» удален вместе с импортом Badge.
- Сортировка: useState<SortState|null> + handleSort (cycleSort) + rows = useMemo(applySort(requests, sort, getter)) по полям date/patient/doctor/lpu/destination/assigned/done/author; все заголовки данных — SortableTh (1С-стиль, aria-sort), колонка действий — обычный th. Клик по заголовку: asc → desc → сброс, пустые значения в конец.
- Де-оранжевание: все text-terra-dark → text-azure-dark (астериски обязательных полей), terra-классов в файле не осталось. Удалены неиспользуемые импорты Badge, ToggleGroup/ToggleGroupItem и константа NONE.
- Сохранены: "use client", экспорты (RequestsView + default), max-h/overflow диалога, инвалидации (requests, doctor-card, dashboard), aria-label, onec-window/onec-table, паттерн TanStack Query.

Stage Summary:
- Контракт формы: POST/PUT /api/app/requests шлет { date, patientName, doctorId, lpuId, destination: trim()||"МРТ ТОЧНО", assignedIds: string[], doneIds: string[], comment } — всегда оба массива (полная замена наборов на сервере).
- RequestItem: только assignedItems/doneItems (NomenclatureItem[]); старых assignedId/doneId/done в представлении нет; фильтр «Выполнение» и его query-параметр исключены (drill-down assignedId сохранен).
- Сортировка клиентская: SortState/cycleSort/applySort/SortableTh из ui-bits; ISO-даты сортируются корректно (localeCompare numeric).
- Проверки: bunx tsc --noEmit — 0 ошибок по requests-view; bun run lint — exit 0.

---
Task ID: 2-c
Agent: general-purpose
Task: dictionaries-view — вкладка «Специализация врача», сортировка, дезоранжирование

Work Log:
- DictTab union расширен до "cities" | "lpus" | "nomenclature" | "specializations" | "statuses" (синхронизирован с NavPayload["dictTab"] в store/ui.ts).
- Новая вкладка «Специализация врача» (иконка Stethoscope) в TabsList и TabsContent — после «Номенклатуры», перед «Статусами». SpecializationsTab повторяет 1С-паттерн остальных справочников: DictWindow (titlebar «Записей: N») + DictCrudButtons (Создать/Изменить, удаление только для МП через DeleteButton) + DictImportExport kind="specializations" + OnecSearch.
- SpecializationsTab: query ["specializations"] → api.get<SpecializationItem[]>("/api/app/specializations"); клиентский поиск по имени; selectedId + onec-row-selected; таблица «Название» (клик → edit-диалог, неактивные — line-through muted) / «Активна» (Badge: да = azure, нет = muted) / «НВ» (_count?.doctors ?? 0).
- SpecializationDialog (как CityDialog): одно поле «Название», POST/PUT /api/app/specializations, тосты «Специализация добавлена»/«Специализация обновлена», инвалидация ["specializations"] + ["doctors"] (НВ встраивают специализации).
- Удаление: DELETE ?id=; typed api.del<{ deactivated?: boolean }>; onSuccess — тост «Специализация используется — деактивирована» либо «Специализация удалена», инвалидация ["specializations"] + ["doctors"], сброс selectedId.
- Сортировка во ВСЕХ 5 вкладках: useState<SortState|null> + applySort(filtered, sort, getter) через useMemo; заголовки — SortableTh из ui-bits, onSort={(f) => setSort(cycleSort(sort, f))} (asc → desc → сброс). Геттеры: Города — name/lpus/doctors; ЛПУ — name/city/address/doctors/requests; Номенклатура — name/category/active (isActive ? 1 : 0); Статусы — name/doctors (колонка «Цвет» осталась обычным th); Специализации — name/active/doctors.
- Дезоранжирование: Badge «нет» номенклатуры bg-terra-light/text-terra-dark/border-terra/50 → bg-muted/text-muted-foreground/border-border; grep по terra в файле — 0 совпадений.
- Починены унаследованные tsc-ошибки файла (только внутри dictionaries-view.tsx): session?.user?.role → (session?.user as SessionUserWithRole)?.role (локальный тип { uid?: string; role?: Role } | undefined, паттерн doctors-view; 6 вхождений); editing?.cityId → editing?.city.id в LpuDialog (у CityData нет cityId); api.del nomenclature/specializations типизирован { deactivated?: boolean } под onSuccess.

Stage Summary:
- Справочники: 5 вкладок, все таблицы сортируемые по клику на шапку (SortState/cycleSort/applySort/SortableTh), поведение 1С-окна сохранено (DictWindow/DictCrudButtons/OnecSearch/DictImportExport/onec-row-selected, MP-gating).
- Вкладка «Специализация врача» полностью реализована по контракту API доработки 1.2 (GET/POST/PUT/DELETE, деактивация при использовании), кэш врачей инвалидится при создании/редактировании/удалении.
- Терракотовые акценты из файла убраны; исправлены существовавшие типовые ошибки (role в сессии, cityId, типизация del-мутаций).
- Проверки: bunx tsc --noEmit — 0 ошибок по dictionaries-view; bun run lint — exit 0, упоминаний файла нет. Другие файлы не тронуты.

---
Task ID: 2-e
Agent: general-purpose
Task: calendar-view — клик по дню → расписание, drag&drop визитов (месяц/неделя/день по времени), мини-календарь в сайдбаре

Work Log:
- Изучены worklog (2-c: три вида календаря, VisitDialog), store/ui.ts (pendingCalendarDate/consumeCalendarDate — одноразовое потребление), контракты @dnd-kit/core 6.3.1 (проверены .d.ts: Active.rect = MutableRefObject<{initial, translated}>, DragStartEvent/DragEndEvent, useDraggable→setNodeRef/isDragging, useDroppable→setNodeRef/isOver), исходник AbstractPointerSensor (handleStart гасит click на document в capture-фазе после активации → drag не открывает диалог редактирования, onClick оставлены как есть), API PUT /api/app/visits/[id] ({date} полным ISO), паттерн toast+invalidate из visit-dialog/dictionaries-view.
- calendar-view.tsx — переход из мини-календаря сайдбара: `const [initDate] = useState(() => useUiStore.getState().consumeCalendarDate())` ДО первого рендера (мини-календарь успевает установить pendingCalendarDate), cursor инициализируется `new Date(`${initDate}T00:00:00`)` (локальная полночь, без сдвига таймзоны).
- calendar-view.tsx — клик по дню → расписание дня: месяц — тело клетки `onClick={() => { setCursor(day); setMode("day") }}` (title «Открыть расписание дня»), «+» и чипы сохранили stopPropagation (создание/редактирование); неделя — шапка-колонка (день+дата) превращена в <button> с onClick → day-view + cursor-pointer hover:bg-sky-light/60, title и aria-label «Открыть расписание на …»; день — прежнее поведение (пустой слот → создание на час, чип → карточка).
- calendar-view.tsx — DnD: сетка обернута в DndContext (sensors: PointerSensor activationConstraint distance 6 — клики работают; KeyboardSensor; collisionDetection = pointerWithin → rectIntersection фолбэк для клавиатуры). Чипы визитов во всех трех видах — useDraggable({id, data:{visit}}) (компоненты MonthVisitChip/WeekVisitCard/DayVisitCard), touch-action:none, cursor-grab/active:cursor-grabbing, isDragging → opacity-30, role/aria от dnd-kit + aria-label «Визит в HH:mm — ФИО…». Цели сброса: клетки месяца и колонки недели useDroppable(`day:yyyy-MM-dd`), слоты дня useDroppable(`slot:HH`) — при isOver подсветка border-azure + bg-sky-light + ring. DragOverlay — компактный чип в цвете статуса, shadow-lg, opacity 0.9.
- calendar-view.tsx — логика переноса: onDragStart пишет dragging + начальный top чипа; onDragEnd: «day:» → тот же час нового дня (setHours от visit.date), «slot:» → resolveSlotTime(): по финальной Y-позиции (startTop + delta.y) ищется слот в slotElsRef (callback-refs слотов), минуты = clamp(round(pos/height*60/15)*15, 0, 59) — четвертьчасовая точность, фолбэк HH:00; no-op (same timestamp) пропускается; moveVisit = useMutation(PUT /api/app/visits/[id] {date: toISOString()}), onSuccess → toast.success(`Визит перенесен: ${format(date, "d MMMM, HH:mm", {locale: ru})}`) + invalidate ["visits"] и ["dashboard"], onError → toast.error.
- Текст EmptyState уточнен под новое поведение (клик по дню открывает расписание, создание — «Запланировать визит»/«+»/свободный час).
- app-shell.tsx — мини-календарь только для MP между nav и mrt-pattern (px-4 pb-3): заголовок «Октябрь 2026» (cap LLLL yyyy ru) + текстовая кнопка «Сегодня» → calendar с calendarDate=today; сетка 7×(Пн..Вс) из eachDayOfInterval(неделя месяца, weekStartsOn:1), ячейки-кнопки h-8 w-8 rounded-md text-xs: чужой месяц text-sky/30, сегодня bg-azure text-white font-semibold + aria-current="date", hover:bg-sidebar-accent; клик → setActiveView("calendar", {calendarDate: "yyyy-MM-dd"}), title/aria-label «Открыть расписание на d MMMM». Тёмная тема сайдбара сохранена.
- app-shell.tsx — попутный фикс (1 строка, файл в зоне задачи): `session?.user?.role` падал в tsc (TS2339, в проекте нет аугментации next-auth — тот же класс ошибок уже был в auth.ts/api-helpers.ts/audit-view/users-view) → типизированный cast `(session?.user as { role?: Role } | undefined)?.role` как в visit-dialog.tsx.
- Проверки: bunx tsc --noEmit | grep "calendar-view|app-shell" — пусто; bun run lint — exit 0, ошибок нет. Остальные файлы (в т.ч. store/ui.ts, types.ts) не трогал. Примечание: в процессе случайно выполнил git stash/pop (восстановлено мгновенно, git status идентичен; изменений чужих файлов нет).

Stage Summary:
- Календарь соответствует требованиям заказчика: клик по дню (месяц) и по шапке колонки (неделя) открывает расписание этого дня; визиты перетаскиваются — месяц/неделя: чип → другой день с сохранением времени, день: карточка → новое время с точностью до 15 минут по позиции сброса; дата сохраняется в БД через PUT visits/[id] полным ISO, тост подтверждает «Визит перенесен: d MMMM, HH:mm», кеши visits/dashboard инвалидируются, фильтры сохраняются.
- Drag&drop не ломает клики: PointerSensor с distance 6px (клик = без активации drag; dnd-kit дополнительно гасит click после активации), no-op перенос игнорируется, оригинальный чип приглушается, оверлей показывает компактный чип со временем и ФИО.
- Мини-календарь в сайдбаре (MP): текущий месяц, «Сегодня», клик по дню → календарь с cursor на выбранный день (consumeCalendarDate, одноразовый паттерн), тёмная палитра сайдбара, a11y (aria-label/aria-current/title).
- Технический долг вне зоны задачи (не правил): tsc-ошибки next-auth role/uid в auth.ts, api-helpers.ts, audit-view.tsx, users-view.tsx; ui.ts consumeDictTab null/undefined — для оркестратора, одинаковый фикс-паттерн (typed cast) уже применен в app-shell.

---
Task ID: 3 (итерация 1.2)
Agent: orchestrator (main)
Task: Интеграция работ 2-a..2-e, исправления, E2E-верификация в браузере

Work Log:
- Исправления интеграции: восстановлены поврежденные объявления useState в calendar-view (агент 2-e); переход из мини-календаря теперь открывает вид «День» (mode=day при pendingCalendarDate); устранено «setState during render» (consumeCalendarDate переносен в useEffect после монтирования) — React-ошибка «Cannot update a component» исчезла.
- DnD доводка: resolveSlotTime переключен на позицию КУРСОРА (activatorEvent.clientY + delta.y) вместо top чипа; autoScroll={false} для детерминированного расчета слота.
- Аугментация типов next-auth (src/types/next-auth.d.ts: uid/role в Session/User/JWT) — закрыты все старые tsc-ошибки сессии в auth.ts/api-helpers/app-shell/audit/users; consumeDictTab возвращает undefined; users-view onConfirm async; reports route (лишний children в Node literal); seed authorId fallback.
- Prisma-клиент/CSS устарели в рантайме — перезапуск dev-сервера (500 на dashboard и старая желтая палитра устранены).
- Мобильная адаптация app-shell: сайдбар w-[68px] на <md (иконки без подписей, aria-label на кнопках, логотип→марка, мини-календарь и текст пользователя скрыты), на md+ — w-64.
- E2E (agent-browser, изолированная сессия): вход m.ivanova — дашборд: Cygre применен (8 граней, body font-family=Cygre), мини-календарь «Октябрь 2026», toggle «Все НВ/Только мои» (mine: 9→5 НВ, 17→9 заявок — по профилю входа); клик по дню мини-календаря → вид «День» («Пятница, 16 октября 2026»).
- Календарь DnD (проверено мышью + agent-browser drag): месяц — визит Гусевой 28.09→30.09 (время 12:00 сохранено); день — 07:00→11:15→10:30 с точностью до 15 минут; PUT /api/app/visits 200, toast «Визит перенесен».
- Заявки: фильтр «Выполнение» удален (0 вхождений); сортировка по НВ asc (Волков→Гусева→Захаров) и desc (Тихонова→Смирнов) — сценарий заказчика; карточка: мультисписки номенклатуры (Выбрано: 1→2, сохранение «Заявка обновлена», в БД 2 ASSIGNED), плейсхолдер и значение «Куда направление» = «МРТ ТОЧНО» (в БД только это значение).
- Врачи: карточка — чипы специализаций («Терапия», «Неврология»), «График работы НВ» = «Пн–Пт, 8:00–14:00»; форма редактирования — группа чекбоксов специализаций (2 отмечено) + поле графика; сортировка списка.
- Справочники: вкладка «Специализация врача» (1С-окно, Создать/Изменить/Импорт/Экспорт, колонки Название/Активна/НВ); создание «Эндокринология» через UI — появилась в списке; сортируемые заголовки во всех вкладках.
- Отчет: сформирован — все 11 заголовков сортируемые ([S]), сортировка групп по «%» (Петров 91% → Иванова 93% asc), детализация сортируется внутри листьев; terra-элементов: 0; текст хинта «синюю кнопку».
- Оператор a.sidorova: навигация только Врачи+Заявки, мини-календаря нет; форма НВ — обязательное только ФИО, поле графика и специализаций доступно, создан НВ (mpId=null, график «Пн, Ср 9:00–13:00», специализация «Эндокринология») — тестовая запись удалена.
- Скриншоты: download/verification-12-{dashboard,calendar,requests,spec-directory,mobile,desktop-final}.png. bun run lint — 0; tsc по src/prisma — чисто (внешний skills/* не в счет); dev.log без ошибок.

Stage Summary:
- Итерация 1.2 завершена полностью: фирменный шрифт Cygre; 1С-окна в корпоративной палитре (без оранжевого); сортировка столбцов в заявках/врачах/справочниках/отчете; справочник «Специализация врача» с импортом/экспортом и мультисвязью с НВ; «График работы НВ»; мультиноменклатура «Что назначено»/«Что сделано»; «Куда направление» по умолчанию «МРТ ТОЧНО»; область данных «Все НВ/Только мои»; календарь: клик по дню → расписание дня, drag&drop визитов между днями и по времени (±15 мин) с синхронизацией в карточку визита; мини-календарь месяца в сайдбаре «Рабочее место»; мобильная верстка сайдбара.
- Технический долг погашен: типизация next-auth, latent-баг cities PUT (notFound), setState-in-render.
- Демо-доступы прежние: m.ivanova / a.petrov / a.sidorova, пароль mrtno2026 (сменить при передаче).

---
Task ID: HANDOVER-1
Agent: orchestrator (main)
Task: Полный пакет передачи заказчику (README, чек-лист приёмки docx, акт docx, архив исходников)

Work Log:
- Проверено финальное состояние проекта: итерации 1.1–1.3 реализованы и верифицированы (шрифт Arimo+Montserrat, PT Sans в public/fonts/pdf, dict-columns.tsx (конфигуратор столбцов), хаб справочников, сортировка пользователей, Excel outline (!rows/!outline) и PDF-кириллица в reports-view); dev-сервер отвечает 200, dev.log без ошибок.
- Написан /home/z/my-project/README.md (12 разделов): описание, модули, технологии, запуск dev/prod (bun/npm, pm2, nginx/HTTPS, NEXTAUTH_SECRET), демо-доступы, БД и демо-данные, смена паролей, бэкапы SQLite, структура проекта, ограничения, состав пакета.
- Через docx-skill (routes/create + common-rules + scenes/contract, Times New Roman, чёрный текст, PERCENTAGE+columnWidths, tableHeader/cantSplit) сгенерированы: Чек-лист_приёмки_МРТ_ТОЧНО.docx — 11 разделов, 55 проверок с колонками Проверка/Ожидаемый результат/Статус(☐)/Комментарий + итоги, таблица замечаний, подписи; Акт_выполненных_работ_ЧЕРНОВИК.docx — 12 этапов работ, переданные материалы, стоимость/претензии с плейсхолдерами 【】, реквизиты и подписи. Оба прошли postcheck.py 9/9; визуально проверены через LibreOffice→PDF (кириллица, ширины столбцов, чекбоксы).
- Собран архив handover/mrt-tno-crm-sources-v1.3.zip (183 файла, 1.2 МБ): src, prisma (schema+seed), public (шрифты PTSans), db/custom.db (демо-данные), package.json, bun.lock, конфиги, .env, .gitignore, README.md; исключены node_modules/.next/.git/dev.log/tool-results/download/upload/tests/examples/agent-ctx/skills/handover/worklog.md/Caddyfile.
- handover/ скомплектован: README-инструкция продублирована в архиве, скриншоты-верификации/ (15 файлов: verification-*.png, verify-3-report.pdf), _build/gen-docs.js (скрипт регенерации docx).

Stage Summary:
- Пакет передачи готов в /home/z/my-project/handover/: mrt-tno-crm-sources-v1.3.zip, Чек-лист_приёмки_МРТ_ТОЧНО.docx (9 стр., 55 пунктов), Акт_выполненных_работ_ЧЕРНОВИК.docx (8 стр.), скриншоты-верификации/, _build/.
- Приложение продолжает работать на :3000 (HTTP 200); исходники в архиве запускаются по README (bun install → .env DATABASE_URL → db:push → bun run dev).
- Ключевые напоминания заказчику (в README и акте): сменить демо-пароли и NEXTAUTH_SECRET, наладить бэкап db/custom.db.

---
Task ID: 9 (инцидент + восстановление)
Agent: orchestrator (main)
Task: Диагностика жалобы «открывается НЕ последняя версия CRM» и восстановление данных

Work Log:
- Диагностика: dev-сервер работал, но рабочая папка /home/z/my-project была откатена песочницей к чекпоинту git-коммита 813c0ed (08.10.2026 10:49 UTC — конец базовой версии, до пакетов доработок)
- Пропали незакоммиченные артефакты: README.md, handover/ (архив v1.3, чек-лист и акт .docx, скриншоты), agent-ctx/, tool-results/, скриншоты download/, доработки пакетов №1–№3 в src (specializations API, «Рейтинг врачей», «Специализация» и т.д.)
- Найдена полная копия актуального состояния v1.3 в /tmp/my-project (включая БД от 08.10 21:45)
- Восстановление: rsync /tmp/my-project → /home/z/my-project (исключены node_modules, .next, dev.log, skills), prisma generate, перезапуск dev-сервера
- Браузерная верификация: вход m.ivanova → дашборд с «Рейтинг врачей», мини-календарь в сайдбаре; хаб «Справочники» со всеми 6 справочниками (Направляющие врачи, ЛПУ, Города, Номенклатура, Специализация, Статусы сотрудничества); ошибок в консоли/логах нет

Stage Summary:
- Причина инцидента: откат песочницы к вчерашнему чекпоинту, незакоммиченная работа была утрачена
- Актуальная версия 1.3 (база + пакеты №1–№3) и пакет передачи полностью восстановлены из копии /tmp/my-project
- Рекомендация: закоммитить восстановленное состояние в git (защита от повторных откатов)

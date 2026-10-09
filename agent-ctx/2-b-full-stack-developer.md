# Task 2-b — full-stack-developer — Work Record

Дата: 2026-10-08 · Проект: /home/z/my-project (CRM «МРТ ТОЧНО»)

## Задача
Доработка этапа 1.1 по обратной связи заказчика. Ровно два файла:
- `src/components/views/doctors-view.tsx`
- `src/components/views/requests-view.tsx`

## Что сделано

### doctors-view.tsx («Врачи (НВ)»)
1. **Список в стиле 1С**: сетка карточек → `<div className="onec-window"><div className="max-h-96 overflow-y-auto"><table className="onec-table">` (желтая sticky-шапка и hover строк — из globals.css). Колонки: ФИО, Статус (StatusPill цветом `status.color`), МП (`doctor.mp?.name ?? "—"`), ЛПУ (чипы: первые 2 + «+N», title с полным списком), Город, Телефон, Заявки (`_count.requests`), Визиты (`_count.visits`), Действия.
2. **Переход в карточку — по клику на ФИО** (`button` `text-azure font-medium hover:underline`, title «Открыть карточку врача»). Кнопку «Карточка» из строки убрал. CRM-карточка (диалог) — прежняя.
3. **Фильтры сохранены**: поиск по ФИО, Select МП/статус/ЛПУ/город (sentinel `ALL`), «Сбросить».
4. **Ролевая форма**: «Добавить врача» — обеим ролям.
   - OPERATOR: обязательно только ФИО; «Курирующий МП» — disabled Input «Не назначен» + подсказка «Будет закреплен МП позднее»; **mpId в тело запроса не передается вообще** (`if (isMP) body.mpId = …`).
   - MP: при создании МП по умолчанию = текущий пользователь (`session.uid`); при редактировании — SelectItem «— Без МП —» (sentinel `NONE`), отправляется `mpId: ""` → бэкенд открепляет.
5. **mp nullable**: в строке и шапке карточки «—», в профиле карточки — бейдж «Не закреплен» (terra).
6. **Права**: «Изменить»/«Удалить» в строке и «Редактировать» в карточке — только МП; оператору «—». Роль из `useSession` cast через локальный `SessionUserWithRole = { uid?: string; role?: Role } | undefined` (tsc-чистый паттерн dashboard-view).

### requests-view.tsx («Заявки»)
1. **Клик по строке → карточка заявки** (= диалог редактирования): `tr className="cursor-pointer" onClick=openCard`; Pencil — `e.stopPropagation()`; DeleteButton обернут в `<span onClick={stopPropagation}>` (Radix AlertDialog); hover строк — из CSS `.onec-table`.
2. **Поле «Комментарий»** (Textarea, необязательное) после «Что сделано» в диалоге создания/редактирования; `comment: form.comment.trim() || null` в POST/PUT.
3. **Drill-down из дашборда** — без useEffect:
   ```ts
   const [navFilters] = useState(() => useUiStore.getState().consumeRequestsFilters());
   const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...(navFilters ? {...} : {}) }));
   ```
   `from/to` ISO → `yyyy-MM-dd` через `format` (date-fns) в инициализаторе; поддержаны `mpId/lpuId/doctorId/assignedId/done` (assignedId — только из навигации, контрола нет, «Сбросить» очищает). Работает потому, что `reactStrictMode: false` (двойной consume в StrictMode невозможен).
4. **onec-таблица** (единообразие), индикатор комментария: `MessageSquare` с `title=текст комментария` рядом с пациентом; `r.doctor.mp?.name ?? "—"`; удаление только МП, редактирование обеим ролям.

## Инфра-инцидент (важно для следующих агентов)
Curl-смоук вскрыл **500 на POST /api/app/doctors**: Prisma Client в рантайме был сгенерирован ДО optional-связи `Doctor.mp` («Argument `mp` is missing»), т.е. `prisma generate` после правки схемы не выполнялся/не подхватился. `prisma generate + db push` на живом дев-сервере не применились, при touch роутов сервер упал и сам не поднялся — перезапущен штатным `bun run dev` (setsid/nohup, порт 3000). Код API и схема НЕ менялись (по ТЗ только 2 файла). После рестарта все контракты зеленые.

## Смоук-проверки (curl, сессия m.ivanova / МП)
- POST `/api/app/doctors` без mpId → 201, `mpId: null` ✔
- PUT `/api/app/doctors/[id]` `mpId:""` → открепление (`mpId: null`) ✔; с uuid → закрепление ✔
- GET карточка НВ → `mp: null` ✔
- POST `/api/app/requests` с `comment` → сохранен ✔; PUT comment → обновлен ✔
- GET `requests?assignedId=…&done=0`, `?doctorId=…` → фильтрация ✔, `comment` на строках ✔
- Тестовые данные удалены (DELETE 200). В журнале аудита остались записи CREATE/UPDATE/DELETE от смоука — ожидаемо.

## Статус проверок
- `bun run lint` — **0 ошибок**
- `bunx tsc --noEmit` — **0 ошибок** в doctors-view/requests-view
- `GET /` → 200; dev.log (последние строки) — компиляция чистая

## Контракты, использованные как есть
`@/lib/api-client` (api.get/post/put/del, qs), `@/components/shared/ui-bits` (SectionCard, EmptyState, DeleteButton, StatusChip, fmtDate, RowsSkeleton), `@/lib/types` (DoctorItem.mp: {id,name}|null, RequestItem.comment: string|null, Role), `@/store/ui` (consumeRequestsFilters, setActiveView), sonner toast + qc.invalidateQueries после мутаций.

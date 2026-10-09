"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type { DoctorItem, UserBasic, VisitItem } from "@/lib/types";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import { EmptyState, RowsSkeleton, StatusChip } from "@/components/shared/ui-bits";
import { VisitDialog } from "@/components/views/visit-dialog";
import { useUiStore } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week" | "day";
type VisitStatus = VisitItem["status"];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Границы сетки часов вида «День» */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 21;
const SLOT_HEIGHT = 56; // px — высота строки часа (min-h слота)

/** Цвет чипа визита в сетке — по статусу (гайдлайн: лазурь / синий / терракот) */
const CHIP_BG: Record<VisitStatus, string> = {
  PLANNED: "bg-azure hover:bg-azure-dark",
  CONDUCTED: "bg-brand hover:bg-brand-dark",
  CANCELLED: "bg-terra hover:bg-terra-dark",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const fmtTime = (d: string | Date) => format(new Date(d), "HH:mm");
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Цели сброса: приоритет — ячейка/слот под курсором; пересечение прямоугольников — фолбэк (клавиатурный drag) */
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

/**
 * Время сброса в виде «День»: по финальной Y-позиции чипа (начальный top + дельта)
 * находим слот часа и минуты с точностью до четверти часа.
 * Фолбэк — час слота, на который произошел сброс (HH:00).
 */
function resolveSlotTime(
  slotEls: Map<number, HTMLElement>,
  startTop: number | null,
  deltaY: number,
  fallbackHour: number
): { hour: number; minutes: number } {
  if (startTop != null) {
    const finalTop = startTop + deltaY;
    for (const [h, el] of slotEls) {
      const r = el.getBoundingClientRect();
      if (finalTop >= r.top && finalTop < r.bottom) {
        const raw = ((finalTop - r.top) / r.height) * 60;
        const minutes = Math.min(59, Math.max(0, Math.round(raw / 15) * 15));
        return { hour: h, minutes };
      }
    }
  }
  return { hour: fallbackHour, minutes: 0 };
}

export function CalendarView() {
  // —— Переход из мини-календаря сайдбара (одноразовое значение) + вид и навигация ——
  const [initDate] = useState(() => useUiStore.getState().pendingCalendarDate);
  // одноразовое значение очищается после монтирования (не во время рендера)
  useEffect(() => {
    useUiStore.getState().consumeCalendarDate();
  }, []);
  const [mode, setMode] = useState<ViewMode>(initDate ? "day" : "month");
  const [cursor, setCursor] = useState<Date>(() =>
    initDate ? new Date(`${initDate}T00:00:00`) : new Date()
  );

  // —— Фильтры ("ALL" = без фильтра) ——
  const [mpFilter, setMpFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [doctorFilter, setDoctorFilter] = useState("ALL");

  // —— Диалог (общий VisitDialog, монтируется условно) ——
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VisitItem | null>(null);
  const [dialogDate, setDialogDate] = useState<Date>(new Date());
  const [dialogTime, setDialogTime] = useState<string | undefined>(undefined);

  // —— Drag & drop визитов ——
  const [dragging, setDragging] = useState<VisitItem | null>(null);
  const dragStartTopRef = useRef<number | null>(null);
  const slotElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const sensors = useSensors(
    // distance 6px: обычный клик не активирует drag (клик по чипу/дню работает),
    // а завершенный drag не порождает click (PointerSensor гасит click после активации)
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // —— Справочники для фильтров (диалог тянет НВ из общего кеша) ——
  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["users-basic"],
    queryFn: () => api.get("/api/app/users?basic=1"),
  });
  const mps = useMemo(() => (users ?? []).filter((u) => u.role === "MP"), [users]);

  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors"],
    queryFn: () => api.get("/api/app/doctors"),
  });
  const doctorOptions = useMemo(
    () => (doctors ?? []).filter((d) => mpFilter === "ALL" || d.mpId === mpFilter),
    [doctors, mpFilter]
  );

  // —— Период выборки (включая дни соседних месяцев в сетке; в дне — сам день) ——
  const range = useMemo(() => {
    if (mode === "month") {
      return {
        from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      };
    }
    if (mode === "week") {
      return {
        from: startOfWeek(cursor, { weekStartsOn: 1 }),
        to: endOfWeek(cursor, { weekStartsOn: 1 }),
      };
    }
    return { from: cursor, to: cursor };
  }, [cursor, mode]);

  // —— Визиты ——
  const visitsQuery = useQuery<VisitItem[]>({
    queryKey: [
      "visits",
      mode,
      iso(range.from),
      iso(range.to),
      mpFilter,
      statusFilter,
      doctorFilter,
    ],
    queryFn: () =>
      api.get<VisitItem[]>(
        `/api/app/visits${qs({
          from: iso(range.from),
          to: `${iso(range.to)}T23:59:59`,
          mpId: mpFilter === "ALL" ? undefined : mpFilter,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          doctorId: doctorFilter === "ALL" ? undefined : doctorFilter,
        })}`
      ),
  });

  const qc = useQueryClient();
  // Перенос визита drag&drop: дата уходит полным ISO (тот же час — другой день / тот же день — новое время)
  const moveVisit = useMutation({
    mutationFn: ({ id, date }: { id: string; date: Date }) =>
      api.put(`/api/app/visits/${id}`, { date: date.toISOString() }),
    onSuccess: (_res, vars) => {
      toast.success(
        `Визит перенесен: ${format(vars.date, "d MMMM, HH:mm", { locale: ru })}`
      );
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // —— Группировка визитов по дням ——
  const grouped = useMemo(() => {
    const map = new Map<string, VisitItem[]>();
    (visitsQuery.data ?? []).forEach((v) => {
      const key = iso(new Date(v.date));
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    });
    return map;
  }, [visitsQuery.data]);

  // —— Клетки месячной/недельной сетки (Пн–Вс) ——
  const days = useMemo(
    () => eachDayOfInterval({ start: range.from, end: range.to }),
    [range]
  );

  // —— Вид «День»: визиты выбранного дня, разбитые по часам ——
  const dayVisits = useMemo(
    () => (mode === "day" ? (grouped.get(iso(cursor)) ?? []) : []),
    [mode, grouped, cursor]
  );

  // Часы сетки: 07:00–21:00 + часы, в которых есть визиты вне диапазона
  const dayHours = useMemo(() => {
    const base: number[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) base.push(h);
    const extra = dayVisits
      .map((v) => getHours(new Date(v.date)))
      .filter((h) => h < DAY_START_HOUR || h > DAY_END_HOUR);
    return [...new Set([...base, ...extra])].sort((a, b) => a - b);
  }, [dayVisits]);

  const visitsByHour = useMemo(() => {
    const map = new Map<number, VisitItem[]>();
    [...dayVisits]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((v) => {
        const h = getHours(new Date(v.date));
        const arr = map.get(h) ?? [];
        arr.push(v);
        map.set(h, arr);
      });
    return map;
  }, [dayVisits]);

  // Автопрокрутка сетки дня к текущему часу (без setState — прямой DOM-скролл)
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = dayScrollRef.current;
    if (!el || mode !== "day" || !isToday(cursor)) return;
    const y = (getHours(new Date()) - DAY_START_HOUR) * SLOT_HEIGHT;
    el.scrollTop = Math.max(0, y - SLOT_HEIGHT * 2);
  }, [mode, cursor]);

  const step = (dir: 1 | -1) =>
    setCursor(
      mode === "month"
        ? addMonths(cursor, dir)
        : mode === "week"
          ? addWeeks(cursor, dir)
          : addDays(cursor, dir)
    );

  // —— Диалог: открытие ——
  function openCreateForDay(day: Date, time?: string) {
    setEditing(null);
    setDialogDate(day);
    setDialogTime(time);
    setDialogOpen(true);
  }
  function openEdit(v: VisitItem) {
    setEditing(v);
    setDialogOpen(true);
  }

  // —— Клик по дню → расписание этого дня (месяц/неделя) ——
  function openDaySchedule(day: Date) {
    setCursor(day);
    setMode("day");
  }

  // —— Drag & drop: старт/завершение переноса ——
  function handleDragStart(e: DragStartEvent) {
    setDragging((e.active.data.current?.visit as VisitItem | undefined) ?? null);
    dragStartTopRef.current = e.active.rect.current.initial?.top ?? null;
  }

  function handleDragCancel() {
    setDragging(null);
    dragStartTopRef.current = null;
  }

  function handleDragEnd(e: DragEndEvent) {
    const visit = (e.active.data.current?.visit as VisitItem | undefined) ?? null;
    const overId = e.over?.id;
    const startTop = dragStartTopRef.current;
    setDragging(null);
    dragStartTopRef.current = null;
    if (!visit || !overId) return;
    const target = String(overId);
    let newDate: Date | null = null;
    if (target.startsWith("day:")) {
      // Месяц/неделя: визит переезжает на другой день с тем же временем
      const old = new Date(visit.date);
      const day = new Date(`${target.slice(4)}T00:00:00`);
      day.setHours(old.getHours(), old.getMinutes(), 0, 0);
      newDate = day;
    } else if (target.startsWith("slot:")) {
      // День: тот же день, новое время (точность до 15 минут по курсору сброса)
      const activator = e.activatorEvent as PointerEvent | MouseEvent | undefined;
      const pointerY =
        activator && typeof activator.clientY === "number"
          ? activator.clientY + e.delta.y
          : startTop != null
            ? startTop + e.delta.y
            : null;
      const { hour, minutes } = resolveSlotTime(
        slotElsRef.current,
        pointerY,
        0,
        Number(target.slice(5))
      );
      const slot = new Date(cursor);
      slot.setHours(hour, minutes, 0, 0);
      newDate = slot;
    }
    if (!newDate || newDate.getTime() === new Date(visit.date).getTime()) return;
    moveVisit.mutate({ id: visit.id, date: newDate });
  }

  const periodTitle =
    mode === "month"
      ? cap(format(cursor, "LLLL yyyy", { locale: ru }))
      : mode === "week"
        ? `${cap(format(range.from, "d MMMM", { locale: ru }))} — ${format(
            range.to,
            "d MMMM yyyy",
            { locale: ru }
          )}`
        : cap(format(cursor, "EEEE, d MMMM yyyy", { locale: ru }));

  const noVisits =
    !visitsQuery.isLoading && !visitsQuery.error && (visitsQuery.data ?? []).length === 0;

  return (
    <div className="space-y-6">
      {/* —— Фильтры —— */}
      <SectionFilters
        mps={mps}
        mpFilter={mpFilter}
        setMpFilter={setMpFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        doctorOptions={doctorOptions}
        doctorFilter={doctorFilter}
        setDoctorFilter={setDoctorFilter}
        onCreate={() => openCreateForDay(new Date())}
      />

      {/* —— Календарь —— */}
      <section className="rounded-xl border border-border bg-white p-6 shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
        {/* Навигация периода */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-brand hover:bg-sky-light"
              onClick={() => step(-1)}
              aria-label="Предыдущий период"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </Button>
            <h2 className="font-display text-lg font-bold text-brand min-w-[190px] text-center">
              {periodTitle}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-brand hover:bg-sky-light"
              onClick={() => step(1)}
              aria-label="Следующий период"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-8 border-sky/40 text-brand hover:bg-sky-light"
              onClick={() => setCursor(new Date())}
            >
              Сегодня
            </Button>
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            value={mode}
            onValueChange={(v) => {
              if (v === "month" || v === "week" || v === "day") setMode(v);
            }}
            className="rounded-lg border border-border bg-soft p-1"
          >
            <ToggleGroupItem
              value="month"
              className="gap-1.5 rounded-md px-3 text-xs data-[state=on]:bg-sky-light data-[state=on]:text-brand"
            >
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} /> Месяц
            </ToggleGroupItem>
            <ToggleGroupItem
              value="week"
              className="gap-1.5 rounded-md px-3 text-xs data-[state=on]:bg-sky-light data-[state=on]:text-brand"
            >
              <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} /> Неделя
            </ToggleGroupItem>
            <ToggleGroupItem
              value="day"
              className="gap-1.5 rounded-md px-3 text-xs data-[state=on]:bg-sky-light data-[state=on]:text-brand"
            >
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} /> День
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {visitsQuery.error ? (
          <div className="rounded-xl border border-terra/50 bg-terra-light p-6 text-sm text-brand-dark">
            Не удалось загрузить визиты: {(visitsQuery.error as Error).message}
          </div>
        ) : visitsQuery.isLoading ? (
          <RowsSkeleton rows={6} />
        ) : (
          <>
            {noVisits && (
              <EmptyState
                title="Визитов в выбранном периоде нет"
                hint="Нажмите «Запланировать визит» или «+» в нужном дне; в виде «День» — кликните по свободному часу"
                className="py-6"
              />
            )}

            <DndContext autoScroll={false}
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              {mode === "month" ? (
                <>
                  {/* Шапка дней недели */}
                  <div className="mb-2 grid grid-cols-7 gap-2">
                    {WEEKDAYS.map((w) => (
                      <div
                        key={w}
                        className="text-center text-[11px] font-semibold uppercase tracking-wide text-sky"
                      >
                        {w}
                      </div>
                    ))}
                  </div>
                  {/* Сетка месяца */}
                  <div className="grid grid-cols-7 gap-2">
                    {days.map((day) => (
                      <MonthDayCell
                        key={iso(day)}
                        day={day}
                        visits={grouped.get(iso(day)) ?? []}
                        dim={!isSameMonth(day, cursor)}
                        onOpenDay={openDaySchedule}
                        onCreate={openCreateForDay}
                        onEdit={openEdit}
                      />
                    ))}
                  </div>
                </>
              ) : mode === "day" ? (
                /* —— Сетка дня по часам (07:00–21:00) —— */
                <div
                  ref={dayScrollRef}
                  className="max-h-[600px] overflow-y-auto rounded-lg border border-border"
                >
                  {dayHours.map((h) => (
                    <DayHourRow
                      key={h}
                      hour={h}
                      visits={visitsByHour.get(h) ?? []}
                      isCurrent={isToday(cursor) && getHours(new Date()) === h}
                      slotEls={slotElsRef}
                      onCreateSlot={() => openCreateForDay(cursor, `${pad2(h)}:00`)}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              ) : (
                /* —— Сетка недели —— */
                <div className="grid grid-cols-7 gap-3">
                  {days.map((day) => (
                    <WeekColumn
                      key={iso(day)}
                      day={day}
                      visits={grouped.get(iso(day)) ?? []}
                      onOpenDay={openDaySchedule}
                      onCreate={openCreateForDay}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              )}

              {/* Оверлей перетаскиваемого визита */}
              <DragOverlay dropAnimation={null}>
                {dragging ? (
                  <div
                    style={{ opacity: 0.9 }}
                    className={cn(
                      "max-w-[220px] truncate rounded-md px-2 py-1 text-[11px] font-medium text-white shadow-lg",
                      CHIP_BG[dragging.status]
                    )}
                  >
                    {fmtTime(dragging.date)} {dragging.doctor?.fullName ?? "Врач"}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {/* Легенда статусов */}
            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <span className="font-medium text-brand">Легенда:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-azure" /> Запланирован
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Проведен
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-terra" /> Отменен
              </span>
            </div>
          </>
        )}
      </section>

      {/* —— Общий диалог создания/редактирования визита —— */}
      {dialogOpen && (
        <VisitDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          visit={editing}
          defaultDate={dialogDate}
          defaultTime={dialogTime}
        />
      )}
    </div>
  );
}

/* ============ Drag & drop: чипы визитов и цели сброса ============ */

type EditVisit = (v: VisitItem) => void;
type OpenDay = (day: Date) => void;
type CreateForDay = (day: Date, time?: string) => void;

/** Чип визита в месячной сетке — перетаскиваемый, клик открывает карточку */
function MonthVisitChip({
  visit,
  dim,
  onEdit,
}: {
  visit: VisitItem;
  dim: boolean;
  onEdit: EditVisit;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: visit.id,
    data: { visit },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(visit);
      }}
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      title={`${fmtTime(visit.date)} · ${visit.doctor?.fullName ?? "—"} · ${visit.purpose}`}
      aria-label={`Визит в ${fmtTime(visit.date)} — ${visit.doctor?.fullName ?? "врач"}. Открыть карточку`}
      className={cn(
        "w-full cursor-grab truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-white transition-opacity active:cursor-grabbing",
        CHIP_BG[visit.status],
        dim && "opacity-60",
        isDragging && "opacity-30"
      )}
    >
      {fmtTime(visit.date)} {visit.doctor?.fullName ?? "Врач"}
    </button>
  );
}

/** День в месячной сетке: клик по телу дня → расписание дня, «+» → создание, сброс чипа → перенос */
function MonthDayCell({
  day,
  visits,
  dim,
  onOpenDay,
  onCreate,
  onEdit,
}: {
  day: Date;
  visits: VisitItem[];
  dim: boolean;
  onOpenDay: OpenDay;
  onCreate: CreateForDay;
  onEdit: EditVisit;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso(day)}` });
  return (
    <div
      ref={setNodeRef}
      onClick={() => onOpenDay(day)}
      title="Открыть расписание дня"
      className={cn(
        "group/cell flex min-h-[112px] cursor-pointer flex-col gap-1 rounded-lg border p-1.5 transition-colors",
        dim ? "border-border/60 bg-soft" : "border-border bg-white hover:border-sky/50",
        isToday(day) && "border-azure/60 bg-sky-light/50 ring-1 ring-azure",
        isOver && "border-azure bg-sky-light/70 ring-2 ring-azure"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full font-display text-[11px] font-bold",
            isToday(day)
              ? "bg-azure text-white"
              : dim
                ? "text-muted-foreground/50"
                : "text-brand"
          )}
        >
          {day.getDate()}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCreate(day);
          }}
          className="text-sky opacity-0 transition-opacity hover:text-azure group-hover/cell:opacity-100"
          aria-label={`Запланировать визит на ${iso(day)}`}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {visits.slice(0, 3).map((v) => (
          <MonthVisitChip key={v.id} visit={v} dim={dim} onEdit={onEdit} />
        ))}
        {visits.length > 3 && (
          <span className="px-1 font-display text-[10px] font-semibold text-sky">
            +{visits.length - 3} ещё
          </span>
        )}
      </div>
    </div>
  );
}

/** Карточка визита в недельной сетке — перетаскиваемая, клик открывает карточку */
function WeekVisitCard({ visit, onEdit }: { visit: VisitItem; onEdit: EditVisit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: visit.id,
    data: { visit },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onEdit(visit)}
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      aria-label={`Визит в ${fmtTime(visit.date)} — ${visit.doctor?.fullName ?? "врач"}. Открыть карточку`}
      className={cn(
        "w-full cursor-grab rounded-lg border border-border bg-white p-2.5 text-left shadow-[0_1px_6px_rgba(25,70,136,0.06)] transition-colors hover:border-azure/60 active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <p className="truncate text-xs font-semibold text-brand">
        <span className="font-display text-[11px] font-bold text-azure">
          {fmtTime(visit.date)}
        </span>{" "}
        {visit.doctor?.fullName ?? "—"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
        {visit.purpose}
      </p>
      {visit.lpu && <p className="mt-1 truncate text-[10px] text-sky">{visit.lpu.name}</p>}
      <div className="mt-1.5">
        <StatusChip status={visit.status} />
      </div>
    </button>
  );
}

/** Колонка дня в недельной сетке: заголовок → расписание дня, сброс чипа → перенос на этот день */
function WeekColumn({
  day,
  visits,
  onOpenDay,
  onCreate,
  onEdit,
}: {
  day: Date;
  visits: VisitItem[];
  onOpenDay: OpenDay;
  onCreate: CreateForDay;
  onEdit: EditVisit;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso(day)}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[400px] flex-col rounded-lg border",
        isToday(day) ? "border-azure/60 bg-sky-light/40" : "border-border bg-white",
        isOver && "border-azure bg-sky-light/70 ring-2 ring-azure"
      )}
    >
      <button
        type="button"
        onClick={() => onOpenDay(day)}
        title="Открыть расписание дня"
        aria-label={`Открыть расписание на ${format(day, "d MMMM", { locale: ru })}`}
        className="w-full cursor-pointer rounded-t-lg border-b border-border/70 px-2 py-2 text-center transition-colors hover:bg-sky-light/60"
      >
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {cap(format(day, "EEEEEE", { locale: ru }))}
        </div>
        <div
          className={cn(
            "font-display text-sm font-bold",
            isToday(day) ? "text-azure" : "text-brand"
          )}
        >
          {format(day, "d MMMM", { locale: ru })}
        </div>
      </button>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {visits.map((v) => (
          <WeekVisitCard key={v.id} visit={v} onEdit={onEdit} />
        ))}
        <button
          type="button"
          onClick={() => onCreate(day)}
          className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-sky/40 py-1.5 text-[10px] font-medium text-sky transition-colors hover:border-azure hover:text-azure"
        >
          <Plus className="h-3 w-3" strokeWidth={2} /> Добавить
        </button>
      </div>
    </div>
  );
}

/** Карточка визита в виде «День» — перетаскиваемая по времени, клик открывает карточку */
function DayVisitCard({ visit, onEdit }: { visit: VisitItem; onEdit: EditVisit }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: visit.id,
    data: { visit },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(visit);
      }}
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      aria-label={`Визит в ${fmtTime(visit.date)} — ${visit.doctor?.fullName ?? "врач"}. Открыть карточку`}
      className={cn(
        "flex w-full cursor-grab items-center justify-between gap-3 rounded-lg border border-border bg-white p-2.5 text-left shadow-[0_1px_6px_rgba(25,70,136,0.06)] transition-colors hover:border-azure/60 active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-brand">
          <span className="font-display text-[11px] font-bold text-azure">
            {fmtTime(visit.date)}
          </span>{" "}
          {visit.doctor?.fullName ?? "—"}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {visit.purpose}
        </p>
        {visit.lpu && (
          <p className="mt-0.5 truncate text-[10px] text-sky">{visit.lpu.name}</p>
        )}
      </div>
      <div className="shrink-0">
        <StatusChip status={visit.status} />
      </div>
    </button>
  );
}

/** Строка часа в виде «День»: пустой слот → создание, сброс чипа → перенос по времени */
function DayHourRow({
  hour,
  visits,
  isCurrent,
  slotEls,
  onCreateSlot,
  onEdit,
}: {
  hour: number;
  visits: VisitItem[];
  isCurrent: boolean;
  slotEls: { current: Map<number, HTMLElement> };
  onCreateSlot: () => void;
  onEdit: EditVisit;
}) {
  const { setNodeRef: setSlotRef, isOver } = useDroppable({ id: `slot:${hour}` });
  return (
    <div className="flex border-b border-border/60 last:border-b-0">
      {/* Метка часа */}
      <div
        className={cn(
          "w-16 shrink-0 border-r border-border/60 px-2 py-1.5 text-right font-display text-[11px] font-semibold",
          isCurrent ? "bg-sky-light text-azure" : "bg-soft/60 text-sky"
        )}
      >
        {pad2(hour)}:00
      </div>
      {/* Слот часа */}
      <div
        ref={(el) => {
          if (el) slotEls.current.set(hour, el);
          else slotEls.current.delete(hour);
          setSlotRef(el);
        }}
        onClick={onCreateSlot}
        className={cn(
          "group/slot relative min-h-[56px] flex-1 cursor-pointer p-1.5 transition-colors hover:bg-sky-light/40",
          isCurrent && "bg-sky-light/50",
          isOver && "bg-sky-light ring-1 ring-inset ring-azure"
        )}
      >
        {/* Индикатор текущего времени */}
        {isCurrent && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
            style={{ top: `${(getMinutes(new Date()) / 60) * 100}%` }}
          >
            <span className="-ml-1 h-2 w-2 rounded-full bg-azure" />
            <span className="h-px flex-1 bg-azure/60" />
          </div>
        )}
        <Plus
          className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-sky opacity-0 transition-opacity group-hover/slot:opacity-100"
          strokeWidth={2}
          aria-hidden
        />
        {visits.length === 0 ? (
          <span className="select-none text-[11px] text-transparent transition-colors group-hover/slot:text-muted-foreground/60">
            Запланировать на {pad2(hour)}:00
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visits.map((v) => (
              <DayVisitCard key={v.id} visit={v} onEdit={onEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ Панель фильтров ============ */
function SectionFilters({
  mps,
  mpFilter,
  setMpFilter,
  statusFilter,
  setStatusFilter,
  doctorOptions,
  doctorFilter,
  setDoctorFilter,
  onCreate,
}: {
  mps: UserBasic[];
  mpFilter: string;
  setMpFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  doctorOptions: DoctorItem[];
  doctorFilter: string;
  setDoctorFilter: (v: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-6 shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-brand">Фильтры</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Отбор визитов по сотруднику, врачу и статусу
          </p>
        </div>
        <Button onClick={onCreate} className="gap-1.5">
          <CalendarPlus className="h-4 w-4" strokeWidth={2} /> Запланировать визит
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Медицинский представитель</Label>
          <Select value={mpFilter} onValueChange={setMpFilter}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Все МП</SelectItem>
              {mps.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Статус визита</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Все статусы</SelectItem>
              {(
                Object.entries(VISIT_STATUS_LABELS) as Array<[VisitStatus, string]>
              ).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Врач (НВ)</Label>
          <Select value={doctorFilter} onValueChange={setDoctorFilter}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="ALL">Все врачи</SelectItem>
              {doctorOptions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  );
}

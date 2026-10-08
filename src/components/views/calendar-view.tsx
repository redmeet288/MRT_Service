"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import { api, qs } from "@/lib/api-client";
import type { DoctorItem, LpuWithCity, Role, UserBasic, VisitItem } from "@/lib/types";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import { DeleteButton, EmptyState, RowsSkeleton, StatusChip } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";
type VisitStatus = VisitItem["status"];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Цвет чипа визита в сетке — по статусу (гайдлайн: лазурь / синий / терракот) */
const CHIP_BG: Record<VisitStatus, string> = {
  PLANNED: "bg-azure hover:bg-azure-dark",
  CONDUCTED: "bg-brand hover:bg-brand-dark",
  CANCELLED: "bg-terra hover:bg-terra-dark",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

interface VisitForm {
  doctorId: string;
  lpuId: string; // "none" — ЛПУ не указан
  date: string; // yyyy-MM-dd
  purpose: string;
  comment: string;
  status: VisitStatus;
}

export function CalendarView() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = (session?.user as { role?: Role } | undefined)?.role === "MP";

  // —— Вид и навигация ——
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(new Date());

  // —— Фильтры ("ALL" = без фильтра) ——
  const [mpFilter, setMpFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [doctorFilter, setDoctorFilter] = useState("ALL");

  // —— Диалог создания/редактирования ——
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VisitItem | null>(null);
  const [form, setForm] = useState<VisitForm>({
    doctorId: "",
    lpuId: "none",
    date: format(new Date(), "yyyy-MM-dd"),
    purpose: "",
    comment: "",
    status: "PLANNED",
  });

  // —— Справочники для фильтров и диалога ——
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

  // —— Период выборки (включая дни соседних месяцев в сетке) ——
  const range = useMemo(() => {
    if (mode === "month") {
      return {
        from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      };
    }
    return {
      from: startOfWeek(cursor, { weekStartsOn: 1 }),
      to: endOfWeek(cursor, { weekStartsOn: 1 }),
    };
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

  // —— Клетки месячной сетки (Пн–Вс) ——
  const days = useMemo(
    () => eachDayOfInterval({ start: range.from, end: range.to }),
    [range]
  );

  const step = (dir: 1 | -1) =>
    setCursor(mode === "month" ? addMonths(cursor, dir) : addWeeks(cursor, dir));

  // —— Диалог: открытие ——
  function openCreateForDay(day: Date) {
    setEditing(null);
    setForm({
      doctorId: "",
      lpuId: "none",
      date: iso(day),
      purpose: "",
      comment: "",
      status: "PLANNED",
    });
    setDialogOpen(true);
  }
  function openEdit(v: VisitItem) {
    setEditing(v);
    setForm({
      doctorId: v.doctorId,
      lpuId: v.lpuId ?? "none",
      date: iso(new Date(v.date)),
      purpose: v.purpose,
      comment: v.comment ?? "",
      status: v.status,
    });
    setDialogOpen(true);
  }

  // —— Диалог: опции ЛПУ из привязок выбранного врача ——
  const selectedDoctor = (doctors ?? []).find((d) => d.id === form.doctorId);
  const lpuOptions = useMemo(() => {
    const opts: LpuWithCity[] = (selectedDoctor?.lpus ?? []).map((x) => x.lpu);
    const editLpu = editing?.lpu ?? null;
    if (editLpu && !opts.some((o) => o.id === editLpu.id)) {
      opts.unshift(editLpu);
    }
    return opts;
  }, [selectedDoctor, editing]);

  // —— Мутации ——
  const save = useMutation({
    mutationFn: () => {
      const body = {
        doctorId: form.doctorId,
        lpuId: form.lpuId === "none" ? null : form.lpuId,
        date: form.date,
        purpose: form.purpose.trim(),
        comment: form.comment.trim() || null,
        status: form.status,
      };
      return editing
        ? api.put(`/api/app/visits/${editing.id}`, body)
        : api.post("/api/app/visits", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Визит обновлен" : "Визит запланирован");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/visits/${id}`),
    onSuccess: () => {
      toast.success("Визит удален");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const periodTitle =
    mode === "month"
      ? cap(format(cursor, "LLLL yyyy", { locale: ru }))
      : `${cap(format(range.from, "d MMMM", { locale: ru }))} — ${format(
          range.to,
          "d MMMM yyyy",
          { locale: ru }
        )}`;

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
              if (v === "month" || v === "week") setMode(v);
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
                hint="Кликните по дню в календаре или нажмите «Запланировать визит»"
                className="py-6"
              />
            )}

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
                  {days.map((day) => {
                    const key = iso(day);
                    const list = grouped.get(key) ?? [];
                    const dim = !isSameMonth(day, cursor);
                    return (
                      <div
                        key={key}
                        onClick={() => openCreateForDay(day)}
                        className={cn(
                          "group/cell flex min-h-[112px] cursor-pointer flex-col gap-1 rounded-lg border p-1.5 transition-colors",
                          dim ? "border-border/60 bg-soft" : "border-border bg-white hover:border-sky/50",
                          isToday(day) && "border-azure/60 bg-sky-light/50 ring-1 ring-azure"
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
                              openCreateForDay(day);
                            }}
                            className="text-sky opacity-0 transition-opacity hover:text-azure group-hover/cell:opacity-100"
                            aria-label={`Запланировать визит на ${key}`}
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {list.slice(0, 3).map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(v);
                              }}
                              title={`${v.doctor?.fullName ?? "—"} · ${v.purpose}`}
                              className={cn(
                                "w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-white transition-opacity",
                                CHIP_BG[v.status],
                                dim && "opacity-60"
                              )}
                            >
                              {v.doctor?.fullName ?? "Врач"}
                            </button>
                          ))}
                          {list.length > 3 && (
                            <span className="px-1 font-display text-[10px] font-semibold text-sky">
                              +{list.length - 3} ещё
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* —— Сетка недели —— */
              <div className="grid grid-cols-7 gap-3">
                {days.map((day) => {
                  const key = iso(day);
                  const list = grouped.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex min-h-[400px] flex-col rounded-lg border",
                        isToday(day)
                          ? "border-azure/60 bg-sky-light/40"
                          : "border-border bg-white"
                      )}
                    >
                      <div className="border-b border-border/70 px-2 py-2 text-center">
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
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-2">
                        {list.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => openEdit(v)}
                            className="w-full rounded-lg border border-border bg-white p-2.5 text-left shadow-[0_1px_6px_rgba(25,70,136,0.06)] transition-colors hover:border-azure/60"
                          >
                            <p className="truncate text-xs font-semibold text-brand">
                              {v.doctor?.fullName ?? "—"}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                              {v.purpose}
                            </p>
                            {v.lpu && (
                              <p className="mt-1 truncate text-[10px] text-sky">{v.lpu.name}</p>
                            )}
                            <div className="mt-1.5">
                              <StatusChip status={v.status} />
                            </div>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => openCreateForDay(day)}
                          className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-sky/40 py-1.5 text-[10px] font-medium text-sky transition-colors hover:border-azure hover:text-azure"
                        >
                          <Plus className="h-3 w-3" strokeWidth={2} /> Добавить
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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

      {/* —— Диалог создания/редактирования визита —— */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">
              {editing ? "Редактирование визита" : "Новый визит к НВ"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Обновите данные визита — изменения попадут в журнал аудита."
                : "Заполните поля — врач, дата и цель обязательны."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Врач (НВ) <span className="text-terra-dark">*</span>
              </Label>
              <Select
                value={form.doctorId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, doctorId: v, lpuId: "none" }))
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Выберите врача" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {(doctors ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>ЛПУ (из привязок врача)</Label>
              <Select
                value={form.lpuId}
                onValueChange={(v) => setForm((f) => ({ ...f, lpuId: v }))}
                disabled={!form.doctorId}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Не указывать" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указывать</SelectItem>
                  {lpuOptions.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Дата <span className="text-terra-dark">*</span>
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as VisitStatus }))
                }
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Цель визита <span className="text-terra-dark">*</span>
              </Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="Например: презентация новых протоколов МРТ"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                placeholder="Дополнительная информация о встрече…"
                className="bg-white"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {editing && isMP ? (
              <DeleteButton
                title={`Удалить визит к «${editing.doctor?.fullName ?? "врачу"}»?`}
                description="Визит будет удален безвозвратно, действие попадет в журнал аудита."
                onConfirm={async () => {
                  await remove.mutateAsync(editing.id);
                }}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={
                  !form.doctorId || !form.date || !form.purpose.trim() || save.isPending
                }
                className="gap-1.5"
              >
                <CalendarPlus className="h-4 w-4" strokeWidth={2} />
                {editing ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

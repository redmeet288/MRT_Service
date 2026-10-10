"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api, qs } from "@/lib/api-client";
import type {
  CityData,
  DoctorItem,
  NomenclatureItem,
  RequestItem,
  Role,
  UserBasic,
} from "@/lib/types";
import {
  SectionCard,
  EmptyState,
  DeleteButton,
  RowsSkeleton,
  fmtDate,
  SortableTh,
  cycleSort,
  applySort,
  type SortState,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ClipboardList,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useUiStore } from "@/store/ui";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const ALL = "__all__";
/** Сентинел «не указан» для Radix Select (пустое value запрещено) */
const NONE = "__none__";

/** Пользователь сессии: JWT-колбэк кладет uid и role (типизация next-auth по умолчанию их не знает) */
type SessionUserWithRole = { uid?: string; role?: Role } | undefined;

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная зона) */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** ISO-дата (из drill-down дашборда) → yyyy-MM-dd для input[type=date] */
function isoToYMD(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd");
}

interface RequestFilters {
  from: string;
  to: string;
  doctorId: string;
  lpuId: string;
  mpId: string;
  /** Заполняется только drill-down-переходом с дашборда (отдельного контрола в разделе нет) */
  assignedId: string;
}

const emptyFilters: RequestFilters = {
  from: "",
  to: "",
  doctorId: "",
  lpuId: "",
  mpId: "",
  assignedId: "",
};

/* ============================================================
   Вьюха «Заявки» — учет направлений (список в стиле 1С).
   Mobile-first: на телефоне — карточки вместо таблицы, сворачиваемые
   фильтры и плавающая кнопка «+»; на десктопе — прежняя 1С-таблица.
   ============================================================ */
export function RequestsView() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = (session?.user as SessionUserWithRole)?.role === "MP";

  // Drill-down из дашборда: одноразовое поглощение фильтров в инициализаторе
  // состояния (без useEffect — правило react-hooks/set-state-in-effect)
  const [navFilters] = useState(() => useUiStore.getState().consumeRequestsFilters());
  const [filters, setFilters] = useState<RequestFilters>(() => ({
    ...emptyFilters,
    ...(navFilters
      ? {
          from: isoToYMD(navFilters.from),
          to: isoToYMD(navFilters.to),
          mpId: navFilters.mpId ?? "",
          lpuId: navFilters.lpuId ?? "",
          doctorId: navFilters.doctorId ?? "",
          assignedId: navFilters.assignedId ?? "",
        }
      : {}),
  }));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RequestItem | null>(null);
  // Мобильная панель фильтров (на десктопе всегда развернута)
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Сортировка столбцов таблицы (клик по заголовку: возр. → убыв. → сброс)
  const [sort, setSort] = useState<SortState | null>(null);
  const handleSort = (field: string) => setSort(cycleSort(sort, field));

  /** Открыть карточку заявки (= диалог редактирования) */
  function openCard(r: RequestItem) {
    setEditing(r);
    setFormOpen(true);
  }

  const { data: requests, isLoading } = useQuery<RequestItem[]>({
    queryKey: [
      "requests",
      "list",
      filters.from,
      filters.to,
      filters.doctorId,
      filters.lpuId,
      filters.mpId,
      filters.assignedId,
    ],
    queryFn: () =>
      api.get(
        `/api/app/requests${qs({
          from: filters.from,
          to: filters.to,
          doctorId: filters.doctorId,
          lpuId: filters.lpuId,
          mpId: filters.mpId,
          assignedId: filters.assignedId,
        })}`
      ),
  });
  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors", "all"],
    queryFn: () => api.get("/api/app/doctors"),
  });
  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });
  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["users-basic"],
    queryFn: () => api.get("/api/app/users?basic=1"),
  });

  const mps = useMemo(() => (users ?? []).filter((u) => u.role === "MP"), [users]);

  // Отсортированные строки таблицы (клиентская сортировка; пустые значения — в конец)
  const rows = useMemo(
    () =>
      applySort(requests ?? [], sort, (r, f) => {
        switch (f) {
          case "date":
            return r.date;
          case "patient":
            return r.patientName;
          case "doctor":
            return r.doctor?.fullName ?? "";
          case "lpu":
            return r.lpu?.name ?? "";
          case "destination":
            return r.destination ?? "";
          case "assigned":
            return r.assignedItems.map((i) => i.name).join(", ");
          case "done":
            return r.doneItems.map((i) => i.name).join(", ");
          case "author":
            return r.author?.name ?? "";
          default:
            return null;
        }
      }),
    [requests, sort]
  );

  // Удаление заявки — только МП
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/requests/${id}`),
    onSuccess: () => {
      toast.success("Заявка удалена");
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Число активных фильтров (бейдж на мобильной кнопке «Фильтры»)
  const activeFilterCount = useMemo(
    () =>
      [
        filters.from,
        filters.to,
        filters.doctorId,
        filters.lpuId,
        filters.mpId,
        filters.assignedId,
      ].filter(Boolean).length,
    [filters]
  );

  /* —— Контролы фильтров (общие для мобильной и десктопной панелей) —— */
  const filterControls = (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Период с</Label>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="h-10 w-full bg-white md:h-9 md:w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">по</Label>
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="h-10 w-full bg-white md:h-9 md:w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">НВ</Label>
        <Select
          value={filters.doctorId || ALL}
          onValueChange={(v) => setFilters((f) => ({ ...f, doctorId: v === ALL ? "" : v }))}
        >
          <SelectTrigger className="h-10 w-full bg-white md:h-9 md:w-48">
            <SelectValue placeholder="Все НВ" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>Все НВ</SelectItem>
            {(doctors ?? [])
              .filter((d) => d.isActive)
              .map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">ЛПУ</Label>
        <Select
          value={filters.lpuId || ALL}
          onValueChange={(v) => setFilters((f) => ({ ...f, lpuId: v === ALL ? "" : v }))}
        >
          <SelectTrigger className="h-10 w-full bg-white md:h-9 md:w-48">
            <SelectValue placeholder="Все ЛПУ" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={ALL}>Все ЛПУ</SelectItem>
            {(lpus ?? [])
              .filter((l) => l.isActive)
              .map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">МП</Label>
        <Select
          value={filters.mpId || ALL}
          onValueChange={(v) => setFilters((f) => ({ ...f, mpId: v === ALL ? "" : v }))}
        >
          <SelectTrigger className="h-10 w-full bg-white md:h-9 md:w-44">
            <SelectValue placeholder="Все МП" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все МП</SelectItem>
            {mps.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const resetButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-10 gap-1.5 text-sky hover:text-brand md:h-8"
      onClick={() => setFilters(emptyFilters)}
    >
      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Сбросить
    </Button>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Заявки"
        description="Учет направлений: что назначено НВ и что сделано, по врачам и ЛПУ"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="hidden gap-1.5 bg-azure hover:bg-azure-dark md:inline-flex"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Зарегистрировать заявку
          </Button>
        }
      >
        <div className="space-y-4">
          {/* —— Мобильная панель фильтров (сворачиваемая) —— */}
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 gap-2 border-sky/40 text-brand"
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                Фильтры
                {activeFilterCount > 0 && (
                  <Badge className="h-5 min-w-5 justify-center rounded-full bg-azure px-1.5 text-[10px] text-white hover:bg-azure">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")}
                  aria-hidden
                />
              </Button>
              {activeFilterCount > 0 && resetButton}
            </div>
            {filtersOpen && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-border bg-white p-3 sm:grid-cols-2">
                {filterControls}
              </div>
            )}
          </div>

          {/* —— Десктопная панель фильтров —— */}
          <div className="hidden flex-wrap items-end gap-3 md:flex">
            {filterControls}
            {resetButton}
          </div>

          {/* Список заявок */}
          {isLoading ? (
            <RowsSkeleton rows={6} />
          ) : !requests?.length ? (
            <EmptyState
              title="Заявок не найдено"
              hint="Измените фильтры или зарегистрируйте первое направление пациента"
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Найдено заявок: {requests.length}
                {requests.length >= 5000 && " (показаны первые 5000)"}
              </p>

              {/* —— Мобильные карточки заявок —— */}
              <div className="space-y-2.5 md:hidden">
                {rows.map((r) => (
                  <RequestCard
                    key={r.id}
                    r={r}
                    onOpen={() => openCard(r)}
                    isMP={isMP}
                    onDelete={
                      isMP
                        ? async () => {
                            try {
                              await remove.mutateAsync(r.id);
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }
                        : undefined
                    }
                  />
                ))}
              </div>

              {/* —— Десктопная таблица 1С — клик по строке открывает карточку —— */}
              <div className="onec-window hidden md:block">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Дата"
                          field="date"
                          sort={sort}
                          onSort={handleSort}
                          className="w-24"
                        />
                        <SortableTh label="Пациент" field="patient" sort={sort} onSort={handleSort} />
                        <SortableTh label="НВ" field="doctor" sort={sort} onSort={handleSort} />
                        <SortableTh label="ЛПУ" field="lpu" sort={sort} onSort={handleSort} />
                        <SortableTh
                          label="Куда направление"
                          field="destination"
                          sort={sort}
                          onSort={handleSort}
                        />
                        <SortableTh
                          label="Что назначено"
                          field="assigned"
                          sort={sort}
                          onSort={handleSort}
                        />
                        <SortableTh
                          label="Что сделано"
                          field="done"
                          sort={sort}
                          onSort={handleSort}
                        />
                        <SortableTh label="Автор" field="author" sort={sort} onSort={handleSort} />
                        <th className="w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer"
                          onClick={() => openCard(r)}
                          title="Открыть карточку заявки"
                        >
                          <td className="whitespace-nowrap text-muted-foreground">
                            {fmtDate(r.date)}
                          </td>
                          <td className="font-medium text-brand">
                            <span className="inline-flex items-center gap-1.5">
                              {r.patientName}
                              {r.comment && (
                                <span
                                  title={r.comment}
                                  className="inline-flex text-sky"
                                  aria-label="Заявка с комментарием"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                                </span>
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm">{r.doctor?.fullName ?? "—"}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              МП: {r.doctor?.mp?.name ?? "—"}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm">{r.lpu?.name ?? "—"}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {r.lpu?.city.name ?? ""}
                            </span>
                          </td>
                          <td className="text-sm text-muted-foreground">
                            {r.destination ?? "—"}
                          </td>
                          <td className="text-sm">
                            {r.assignedItems.map((i) => i.name).join(", ") || "—"}
                          </td>
                          <td className="text-sm">
                            {r.doneItems.map((i) => i.name).join(", ") || "—"}
                          </td>
                          <td className="text-sm text-muted-foreground">
                            {r.author?.name ?? "—"}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-sky hover:text-brand"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCard(r);
                                }}
                                aria-label="Редактировать заявку"
                                title="Редактировать"
                              >
                                <Pencil className="h-4 w-4" strokeWidth={2} />
                              </Button>
                              {isMP && (
                                <span
                                  className="inline-flex"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <DeleteButton
                                    title={`Удалить заявку по пациенту «${r.patientName}»?`}
                                    onConfirm={async () => {
                                      try {
                                        await remove.mutateAsync(r.id);
                                      } catch (e) {
                                        toast.error((e as Error).message);
                                      }
                                    }}
                                  />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* —— Плавающая кнопка «Новая заявка» (мобильный) —— */}
      <button
        type="button"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        aria-label="Зарегистрировать заявку"
        className="tap-clean md:hidden fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-azure text-white shadow-[0_6px_20px_rgba(1,150,210,0.45)] transition-colors active:bg-azure-dark"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.4} />
      </button>

      {/* Диалог создания / редактирования заявки (монтируется при открытии — форма инициализируется заново) */}
      {formOpen && <RequestFormDialog request={editing} onOpenChange={setFormOpen} />}
    </div>
  );
}
export default RequestsView;

/* ============ Мобильная карточка заявки ============ */

function RequestCard({
  r,
  onOpen,
  isMP,
  onDelete,
}: {
  r: RequestItem;
  onOpen: () => void;
  isMP: boolean;
  onDelete?: () => Promise<void>;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title="Открыть карточку заявки"
      aria-label={`Заявка по пациенту ${r.patientName} от ${fmtDate(r.date)}. Открыть карточку`}
      className="tap-clean cursor-pointer rounded-xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(25,70,136,0.06)] transition-colors active:bg-sky-light/40"
    >
      {/* Шапка: дата + комментарий · действия */}
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-light px-2.5 py-1 text-[11px] font-semibold text-brand">
          {fmtDate(r.date)}
          {r.comment && (
            <MessageSquare className="h-3.5 w-3.5 text-azure" aria-label="Заявка с комментарием" strokeWidth={2} />
          )}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-sky hover:text-brand"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-label="Редактировать заявку"
          >
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </Button>
          {isMP && onDelete && (
            <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
              <DeleteButton
                title={`Удалить заявку по пациенту «${r.patientName}»?`}
                onConfirm={onDelete}
              />
            </span>
          )}
        </div>
      </div>

      {/* Пациент */}
      <p className="mt-2 font-display text-[15px] font-bold leading-snug text-brand">
        {r.patientName}
      </p>

      {/* НВ и ЛПУ */}
      <div className="mt-2 space-y-1 text-[13px]">
        <p className="flex gap-1.5">
          <span className="shrink-0 text-muted-foreground">НВ:</span>
          <span className="min-w-0 font-medium text-brand-dark">
            {r.doctor?.fullName ?? "—"}
          </span>
        </p>
        <p className="flex gap-1.5">
          <span className="shrink-0 text-muted-foreground">ЛПУ:</span>
          <span className="min-w-0 font-medium text-brand-dark">
            {r.lpu ? `${r.lpu.name} · ${r.lpu.city.name}` : "—"}
          </span>
        </p>
      </div>

      {/* Номенклатура */}
      {(r.assignedItems.length > 0 || r.doneItems.length > 0) && (
        <div className="mt-2 space-y-0.5">
          {r.assignedItems.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-medium text-sky">Назначено:</span>{" "}
              {r.assignedItems.map((i) => i.name).join(", ")}
            </p>
          )}
          {r.doneItems.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-medium text-sky">Сделано:</span>{" "}
              {r.doneItems.map((i) => i.name).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Подвал: автор + куда направление */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="truncate">Автор: {r.author?.name ?? "—"}</span>
        {r.destination && (
          <span className="shrink-0 rounded-full border border-sky/30 px-2 py-0.5">
            {r.destination}
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Диалог регистрации / редактирования заявки.
   Mobile-first: на телефоне — полноэкранный bottom-sheet с крупными
   полями и закрепленной панелью кнопок; на десктопе — диалог.
   ============================================================ */
interface RequestFormState {
  date: string;
  patientName: string;
  doctorId: string;
  lpuId: string;
  destination: string;
  /** Мультивыбор из номенклатуры: «Что назначено» — обязателен, «Что сделано» — нет */
  assignedIds: string[];
  doneIds: string[];
  comment: string;
}

/** Переключение позиции в списке множественного выбора */
function toggleInList(list: string[], id: string, checked: boolean): string[] {
  return checked
    ? list.includes(id)
      ? list
      : [...list, id]
    : list.filter((x) => x !== id);
}

/** Начальное состояние формы: из заявки при редактировании / пустая (дата — сегодня) при создании */
function initRequestForm(request: RequestItem | null): RequestFormState {
  if (!request) {
    return {
      date: todayISO(),
      patientName: "",
      doctorId: "",
      lpuId: "",
      destination: "",
      assignedIds: [],
      doneIds: [],
      comment: "",
    };
  }
  return {
    date: request.date.slice(0, 10),
    patientName: request.patientName,
    doctorId: request.doctorId ?? "",
    lpuId: request.lpuId ?? "",
    destination: request.destination ?? "",
    assignedIds: request.assignedItems.map((i) => i.id),
    doneIds: request.doneItems.map((i) => i.id),
    comment: request.comment ?? "",
  };
}

/** Обертка: мобильный → bottom-sheet, десктоп → диалог (форма общая) */
function RequestFormDialog({
  request,
  onOpenChange,
}: {
  request: RequestItem | null;
  onOpenChange: (o: boolean) => void;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex h-[94dvh] flex-col gap-0 rounded-t-2xl bg-white p-0"
        >
          {/* Ручка перетаскивания */}
          <div className="flex justify-center pt-2" aria-hidden>
            <span className="h-1.5 w-10 rounded-full bg-sky/40" />
          </div>
          <SheetHeader className="p-4 pb-2 text-left">
            <SheetTitle className="font-display text-lg text-brand">
              {request ? "Карточка заявки" : "Новая заявка"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {request
                ? "Просмотр и редактирование направления пациента"
                : "Обязательное поле — только ФИО пациента"}
            </SheetDescription>
          </SheetHeader>
          <RequestFormBody request={request} onOpenChange={onOpenChange} layout="sheet" />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {request ? "Карточка заявки" : "Регистрация заявки"}
          </DialogTitle>
          <DialogDescription>
            {request
              ? "Просмотр и редактирование направления пациента на обследование"
              : "Учет направления пациента на обследование"}
          </DialogDescription>
        </DialogHeader>
        <RequestFormBody request={request} onOpenChange={onOpenChange} layout="dialog" />
      </DialogContent>
    </Dialog>
  );
}

/** Тело формы заявки (поля + кнопки) — общее для sheet и dialog */
function RequestFormBody({
  request,
  onOpenChange,
  layout,
}: {
  request: RequestItem | null;
  onOpenChange: (o: boolean) => void;
  layout: "sheet" | "dialog";
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RequestFormState>(() => initRequestForm(request));

  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors", "all"],
    queryFn: () => api.get("/api/app/doctors"),
  });
  const { data: nomenclature } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature", "active"],
    queryFn: () => api.get("/api/app/nomenclature?active=1"),
  });
  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });

  // Варианты НВ: активные + текущий врач редактируемой заявки (если помечен на удаление)
  const doctorOptions = useMemo<Array<Pick<DoctorItem, "id" | "fullName">>>(() => {
    const list = (doctors ?? [])
      .filter((d) => d.isActive)
      .map((d) => ({ id: d.id, fullName: d.fullName }));
    const cur = request?.doctor;
    if (cur && !list.some((d) => d.id === cur.id)) {
      list.unshift({ id: cur.id, fullName: cur.fullName });
    }
    return list;
  }, [doctors, request]);

  const selectedDoctor = useMemo(
    () => doctors?.find((d) => d.id === form.doctorId) ?? null,
    [doctors, form.doctorId]
  );

  // ЛПУ, привязанные к выбранному НВ (данные lpus уже приходят в ответе doctors)
  const doctorLpus = useMemo(
    () => (selectedDoctor?.lpus ?? []).map((x) => x.lpu).filter((l) => l.isActive !== false),
    [selectedDoctor]
  );

  // Свободные варианты ЛПУ (без НВ / у НВ нет привязок): активные + текущее ЛПУ заявки
  const freeLpuOptions = useMemo<CityData[]>(() => {
    const list = (lpus ?? []).filter((l) => l.isActive);
    if (request?.lpu) {
      const cur: CityData = {
        id: request.lpu.id,
        name: request.lpu.name,
        city: request.lpu.city,
        address: request.lpu.address,
        isActive: request.lpu.isActive ?? true,
      };
      if (!list.some((l) => l.id === cur.id)) list.unshift(cur);
    }
    return list;
  }, [lpus, request]);

  // Режим выбора ЛПУ: 1 привязка — авто; несколько — Select из привязок; 0/без НВ — свободный Select
  const lpuMode: "single" | "multi" | "free" = !selectedDoctor
    ? "free"
    : doctorLpus.length === 1
      ? "single"
      : doctorLpus.length > 1
        ? "multi"
        : "free";

  // Варианты для режима «несколько ЛПУ» (+ защита для редактируемой заявки)
  const multiOptions = useMemo(() => {
    const opts = [...doctorLpus];
    if (request?.lpu && request.lpuId && !opts.some((l) => l.id === request.lpu?.id)) {
      opts.push(request.lpu);
    }
    return opts;
  }, [doctorLpus, request]);

  // Итоговый lpuId: при единственном ЛПУ НВ — подставляется автоматически
  const resolvedLpuId = lpuMode === "single" ? (doctorLpus[0]?.id ?? "") : form.lpuId;

  const lpuCity = useMemo(() => {
    if (!resolvedLpuId) return null;
    const fromDoctor = doctorLpus.find((l) => l.id === resolvedLpuId);
    if (fromDoctor) return fromDoctor.city.name;
    if (request?.lpu && request.lpu.id === resolvedLpuId) return request.lpu.city.name;
    return lpus?.find((l) => l.id === resolvedLpuId)?.city.name ?? null;
  }, [resolvedLpuId, doctorLpus, lpus, request]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: form.date,
        patientName: form.patientName.trim(),
        // НВ и ЛПУ необязательны (доработка): обязателен только пациент
        doctorId: form.doctorId || null,
        lpuId: resolvedLpuId || null,
        destination: form.destination.trim() || "МРТ ТОЧНО",
        assignedIds: form.assignedIds,
        doneIds: form.doneIds,
        comment: form.comment.trim() || null,
      };
      return request
        ? api.put(`/api/app/requests/${request.id}`, body)
        : api.post("/api/app/requests", body);
    },
    onSuccess: () => {
      toast.success(request ? "Заявка обновлена" : "Заявка зарегистрирована");
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fields = (
    <>
      {/* 1. Дата */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">
          Дата <span className="text-azure-dark">*</span>
        </Label>
        <Input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="h-11 md:h-10"
        />
      </div>

      {/* 2. ФИО пациента — единственное обязательное поле */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">
          ФИО пациента <span className="text-azure-dark">*</span>
        </Label>
        <Input
          value={form.patientName}
          onChange={(e) => setForm({ ...form, patientName: e.target.value })}
          placeholder="Иванов Иван Иванович"
          className="h-12 text-base md:h-10"
          autoCapitalize="words"
          enterKeyHint="next"
        />
      </div>

      {/* 3. ФИО НВ — необязательно: пациент может не помнить врача */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">ФИО НВ</Label>
        <Select
          value={form.doctorId || NONE}
          onValueChange={(v) => {
            const nd = doctors?.find((d) => d.id === v);
            const dl = (nd?.lpus ?? []).map((x) => x.lpu).filter((l) => l.isActive !== false);
            setForm((f) => ({
              ...f,
              doctorId: v === NONE ? "" : v,
              lpuId: v === NONE ? "" : dl.length === 1 ? dl[0].id : "",
            }));
          }}
        >
          <SelectTrigger className="h-11 bg-white text-base md:h-10 md:text-sm">
            <SelectValue placeholder="Не указан" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE}>Не указан</SelectItem>
            {doctorOptions.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Если пациент не помнит врача — оставьте «Не указан», информацию можно указать в комментарии
        </p>
      </div>

      {/* 4. ЛПУ и город — автозаполнение из карточки НВ (необязательно) */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">ЛПУ</Label>
        {lpuMode === "single" && (
          <>
            <Input
              disabled
              readOnly
              value={
                doctorLpus[0] ? `${doctorLpus[0].name} · ${doctorLpus[0].city.name}` : "—"
              }
              className="h-11 bg-white text-muted-foreground md:h-10"
            />
            <p className="text-[11px] text-muted-foreground">
              Единственное активное ЛПУ врача — подставлено автоматически
            </p>
          </>
        )}
        {lpuMode === "multi" && (
          <Select
            value={form.lpuId || NONE}
            onValueChange={(v) => setForm({ ...form, lpuId: v === NONE ? "" : v })}
          >
            <SelectTrigger className="h-11 bg-white text-base md:h-10 md:text-sm">
              <SelectValue placeholder="Выберите ЛПУ из привязок НВ" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}>Не указано</SelectItem>
              {multiOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} · {l.city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {lpuMode === "free" && (
          <Select
            value={form.lpuId || NONE}
            onValueChange={(v) => setForm({ ...form, lpuId: v === NONE ? "" : v })}
          >
            <SelectTrigger className="h-11 bg-white text-base md:h-10 md:text-sm">
              <SelectValue placeholder="Не указано (опционально)" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}>Не указано</SelectItem>
              {freeLpuOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} · {l.city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {lpuCity && (
          <p className="text-[11px] text-muted-foreground">Город: {lpuCity}</p>
        )}
      </div>

      {/* 5. Куда направление — по умолчанию сохраняется «МРТ ТОЧНО» */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">Куда направление</Label>
        <Input
          value={form.destination}
          onChange={(e) => setForm({ ...form, destination: e.target.value })}
          placeholder="МРТ ТОЧНО"
          className="h-11 md:h-10"
        />
        <p className="text-[11px] text-muted-foreground">
          Если не изменить — сохранится «МРТ ТОЧНО»
        </p>
      </div>

      {/* 6. Что назначено — мультивыбор из номенклатуры (необязательно) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[13px]">Что назначено</Label>
          <span className="text-[11px] text-muted-foreground">
            Выбрано: {form.assignedIds.length}
          </span>
        </div>
        <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-white p-2 md:max-h-40 md:p-3">
          {!nomenclature?.length ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Справочник номенклатуры пуст — добавьте позиции в разделе «Справочники»
            </p>
          ) : (
            nomenclature.map((n) => (
              <label
                key={n.id}
                className="tap-clean flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-sky-light/60 md:min-h-0 md:gap-2.5 md:py-1.5"
              >
                <Checkbox
                  checked={form.assignedIds.includes(n.id)}
                  onCheckedChange={(c) =>
                    setForm((f) => ({
                      ...f,
                      assignedIds: toggleInList(f.assignedIds, n.id, c === true),
                    }))
                  }
                  aria-label={`Назначить ${n.name}`}
                  className="h-5 w-5 md:h-4 md:w-4"
                />
                <span className="text-[15px] text-brand md:text-sm">{n.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* 7. Что сделано — мультивыбор из номенклатуры (опционально) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[13px]">Что сделано</Label>
          <span className="text-[11px] text-muted-foreground">
            Выбрано: {form.doneIds.length}
          </span>
        </div>
        <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-white p-2 md:max-h-40 md:p-3">
          {!nomenclature?.length ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Справочник номенклатуры пуст — добавьте позиции в разделе «Справочники»
            </p>
          ) : (
            nomenclature.map((n) => (
              <label
                key={n.id}
                className="tap-clean flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-sky-light/60 md:min-h-0 md:gap-2.5 md:py-1.5"
              >
                <Checkbox
                  checked={form.doneIds.includes(n.id)}
                  onCheckedChange={(c) =>
                    setForm((f) => ({
                      ...f,
                      doneIds: toggleInList(f.doneIds, n.id, c === true),
                    }))
                  }
                  aria-label={`Отметить выполненным ${n.name}`}
                  className="h-5 w-5 md:h-4 md:w-4"
                />
                <span className="text-[15px] text-brand md:text-sm">{n.name}</span>
              </label>
            ))
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Опционально — можно заполнить позже при редактировании заявки
        </p>
      </div>

      {/* 8. Комментарий (опционально) */}
      <div className="space-y-1.5">
        <Label className="text-[13px]">Комментарий</Label>
        <Textarea
          rows={layout === "sheet" ? 3 : 2}
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          placeholder="Опционально — заметки по заявке, договоренности…"
          className="text-base md:text-sm"
        />
      </div>
    </>
  );

  const buttons = (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        className={cn("h-12 md:h-10", layout === "sheet" && "flex-1")}
      >
        Отмена
      </Button>
      <Button
        onClick={() => save.mutate()}
        disabled={!form.date || !form.patientName.trim() || save.isPending}
        className={cn(
          "bg-azure hover:bg-azure-dark h-12 md:h-10",
          layout === "sheet" ? "flex-[2] text-base" : ""
        )}
      >
        {save.isPending && <ClipboardList className="h-4 w-4 animate-spin" strokeWidth={2} />}
        {request ? "Сохранить" : "Зарегистрировать"}
      </Button>
    </>
  );

  if (layout === "sheet") {
    return (
      <>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">{fields}</div>
        <div className="flex shrink-0 gap-2 border-t border-border bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {buttons}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4 py-1">{fields}</div>
      <DialogFooter>{buttons}</DialogFooter>
    </>
  );
}

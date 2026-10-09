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
import { ClipboardList, MessageSquare, Pencil, Plus, RotateCcw } from "lucide-react";
import { useUiStore } from "@/store/ui";

const ALL = "__all__";

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
   Вьюха «Заявки» — учет направлений (список в стиле 1С)
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
            return r.doctor.fullName;
          case "lpu":
            return r.lpu.name;
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
            className="gap-1.5 bg-azure hover:bg-azure-dark"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Зарегистрировать заявку
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Панель фильтров */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Период с</Label>
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                className="w-40 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">по</Label>
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                className="w-40 bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">НВ</Label>
              <Select
                value={filters.doctorId || ALL}
                onValueChange={(v) => setFilters((f) => ({ ...f, doctorId: v === ALL ? "" : v }))}
              >
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue placeholder="Все НВ" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>Все НВ</SelectItem>
                  {(doctors ?? []).map((d) => (
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
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue placeholder="Все ЛПУ" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL}>Все ЛПУ</SelectItem>
                  {(lpus ?? []).map((l) => (
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
                <SelectTrigger className="w-44 bg-white">
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sky hover:text-brand"
              onClick={() => setFilters(emptyFilters)}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Сбросить
            </Button>
          </div>

          {/* Таблица заявок — в стиле 1С; клик по строке открывает карточку заявки */}
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
              <div className="onec-window">
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
                            <span className="text-sm">{r.doctor.fullName}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              МП: {r.doctor.mp?.name ?? "—"}
                            </span>
                          </td>
                          <td>
                            <span className="text-sm">{r.lpu.name}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {r.lpu.city.name}
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

      {/* Диалог создания / редактирования заявки (монтируется при открытии — форма инициализируется заново) */}
      {formOpen && <RequestFormDialog request={editing} onOpenChange={setFormOpen} />}
    </div>
  );
}
export default RequestsView;

/* ============================================================
   Диалог регистрации / редактирования заявки (строго по ТЗ)
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
    doctorId: request.doctorId,
    lpuId: request.lpuId,
    destination: request.destination ?? "",
    assignedIds: request.assignedItems.map((i) => i.id),
    doneIds: request.doneItems.map((i) => i.id),
    comment: request.comment ?? "",
  };
}

function RequestFormDialog({
  request,
  onOpenChange,
}: {
  request: RequestItem | null;
  onOpenChange: (o: boolean) => void;
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

  const selectedDoctor = useMemo(
    () => doctors?.find((d) => d.id === form.doctorId) ?? null,
    [doctors, form.doctorId]
  );

  // ЛПУ, привязанные к выбранному НВ (данные lpus уже приходят в ответе doctors)
  const doctorLpus = useMemo(() => selectedDoctor?.lpus.map((x) => x.lpu) ?? [], [selectedDoctor]);

  // Режим выбора ЛПУ: 1 привязка — авто; несколько — Select из привязок; 0 — свободный Select
  const lpuMode: "none" | "single" | "multi" | "free" = !selectedDoctor
    ? "none"
    : doctorLpus.length === 1
      ? "single"
      : doctorLpus.length > 1
        ? "multi"
        : "free";

  // Варианты для режима «несколько ЛПУ» (+ защита для редактируемой заявки)
  const multiOptions = useMemo(() => {
    const opts = [...doctorLpus];
    if (request && request.lpuId && !opts.some((l) => l.id === request.lpuId)) {
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
    if (request?.lpu.id === resolvedLpuId) return request.lpu.city.name;
    return lpus?.find((l) => l.id === resolvedLpuId)?.city.name ?? null;
  }, [resolvedLpuId, doctorLpus, lpus, request]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: form.date,
        patientName: form.patientName.trim(),
        doctorId: form.doctorId,
        lpuId: resolvedLpuId,
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

        <div className="space-y-4 py-1">
          {/* 1. Дата */}
          <div className="space-y-1.5">
            <Label>
              Дата <span className="text-azure-dark">*</span>
            </Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>

          {/* 2. ФИО пациента */}
          <div className="space-y-1.5">
            <Label>
              ФИО пациента <span className="text-azure-dark">*</span>
            </Label>
            <Input
              value={form.patientName}
              onChange={(e) => setForm({ ...form, patientName: e.target.value })}
              placeholder="Иванов Иван Иванович"
            />
          </div>

          {/* 3. ФИО НВ */}
          <div className="space-y-1.5">
            <Label>
              ФИО НВ <span className="text-azure-dark">*</span>
            </Label>
            <Select
              value={form.doctorId}
              onValueChange={(v) => {
                const nd = doctors?.find((d) => d.id === v);
                const dl = nd?.lpus.map((x) => x.lpu) ?? [];
                setForm((f) => ({
                  ...f,
                  doctorId: v,
                  lpuId: dl.length === 1 ? dl[0].id : "",
                }));
              }}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Выберите направляющего врача" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(doctors ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 4. ЛПУ и город — автозаполнение из карточки НВ */}
          <div className="space-y-1.5">
            <Label>
              ЛПУ <span className="text-azure-dark">*</span>
            </Label>
            {lpuMode === "none" && (
              <p className="text-xs text-muted-foreground">
                Сначала выберите НВ — ЛПУ подставится из его карточки
              </p>
            )}
            {lpuMode === "single" && (
              <>
                <Input
                  disabled
                  readOnly
                  value={
                    doctorLpus[0] ? `${doctorLpus[0].name} · ${doctorLpus[0].city.name}` : "—"
                  }
                  className="bg-white text-muted-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Единственное ЛПУ врача — подставлено автоматически
                </p>
              </>
            )}
            {lpuMode === "multi" && (
              <Select
                value={form.lpuId}
                onValueChange={(v) => setForm({ ...form, lpuId: v })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Выберите ЛПУ из привязок НВ" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
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
                value={form.lpuId}
                onValueChange={(v) => setForm({ ...form, lpuId: v })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="У НВ нет привязок — выберите ЛПУ" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(lpus ?? []).map((l) => (
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
            <Label>Куда направление</Label>
            <Input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder="МРТ ТОЧНО"
            />
            <p className="text-[11px] text-muted-foreground">
              Если не изменить — сохранится «МРТ ТОЧНО»
            </p>
          </div>

          {/* 6. Что назначено — мультивыбор из номенклатуры (обязательно) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Что назначено <span className="text-azure-dark">*</span>
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Выбрано: {form.assignedIds.length}
              </span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-3">
              {!nomenclature?.length ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Справочник номенклатуры пуст — добавьте позиции в разделе «Справочники»
                </p>
              ) : (
                nomenclature.map((n) => (
                  <label
                    key={n.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sky-light/60"
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
                    />
                    <span className="text-sm text-brand">{n.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 7. Что сделано — мультивыбор из номенклатуры (опционально) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Что сделано</Label>
              <span className="text-[11px] text-muted-foreground">
                Выбрано: {form.doneIds.length}
              </span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-3">
              {!nomenclature?.length ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Справочник номенклатуры пуст — добавьте позиции в разделе «Справочники»
                </p>
              ) : (
                nomenclature.map((n) => (
                  <label
                    key={n.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sky-light/60"
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
                    />
                    <span className="text-sm text-brand">{n.name}</span>
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
            <Label>Комментарий</Label>
            <Textarea
              rows={2}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Опционально — заметки по заявке, договоренности…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !form.date ||
              !form.patientName.trim() ||
              !form.doctorId ||
              !resolvedLpuId ||
              !form.assignedIds.length ||
              save.isPending
            }
            className="bg-azure hover:bg-azure-dark"
          >
            {save.isPending && <ClipboardList className="h-4 w-4 animate-spin" strokeWidth={2} />}
            {request ? "Сохранить" : "Зарегистрировать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

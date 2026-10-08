"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type {
  CityData,
  DoctorItem,
  NomenclatureItem,
  RequestItem,
  UserBasic,
} from "@/lib/types";
import {
  SectionCard,
  EmptyState,
  DeleteButton,
  RowsSkeleton,
  fmtDate,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ClipboardList, Pencil, Plus, RotateCcw } from "lucide-react";

const ALL = "__all__";
const NONE = "__none__";

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная зона) */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

interface RequestFilters {
  from: string;
  to: string;
  doctorId: string;
  lpuId: string;
  mpId: string;
  done: string; // "" — все, "0" — только невыполненные, "1" — только выполненные
}

const emptyFilters: RequestFilters = { from: "", to: "", doctorId: "", lpuId: "", mpId: "", done: "" };

/* ============================================================
   Вьюха «Заявки» — учет направлений
   ============================================================ */
export function RequestsView() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [filters, setFilters] = useState<RequestFilters>(emptyFilters);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RequestItem | null>(null);

  const { data: requests, isLoading } = useQuery<RequestItem[]>({
    queryKey: [
      "requests",
      "list",
      filters.from,
      filters.to,
      filters.doctorId,
      filters.lpuId,
      filters.mpId,
      filters.done,
    ],
    queryFn: () =>
      api.get(
        `/api/app/requests${qs({
          from: filters.from,
          to: filters.to,
          doctorId: filters.doctorId,
          lpuId: filters.lpuId,
          mpId: filters.mpId,
          done: filters.done,
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

  // Удаление заявки — только МП
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/requests/${id}`),
    onSuccess: () => {
      toast.success("Заявка удалена");
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Выполнение</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                className="rounded-lg bg-white"
                value={filters.done === "" ? "all" : filters.done}
                onValueChange={(v) => {
                  if (v) setFilters((f) => ({ ...f, done: v === "all" ? "" : v }));
                }}
              >
                <ToggleGroupItem value="all" className="px-3 text-xs">
                  Все
                </ToggleGroupItem>
                <ToggleGroupItem value="0" className="px-3 text-xs">
                  Невыполненные
                </ToggleGroupItem>
                <ToggleGroupItem value="1" className="px-3 text-xs">
                  Выполненные
                </ToggleGroupItem>
              </ToggleGroup>
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

          {/* Таблица заявок */}
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
              <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-white">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-24">Дата</TableHead>
                      <TableHead>Пациент</TableHead>
                      <TableHead>НВ</TableHead>
                      <TableHead>ЛПУ</TableHead>
                      <TableHead>Куда направление</TableHead>
                      <TableHead>Что назначено</TableHead>
                      <TableHead>Что сделано</TableHead>
                      <TableHead>Автор</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell className="font-medium text-brand">{r.patientName}</TableCell>
                        <TableCell>
                          <span className="text-sm">{r.doctor.fullName}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            МП: {r.doctor.mp.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{r.lpu.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {r.lpu.city.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.destination ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.assigned?.name ?? "—"}</TableCell>
                        <TableCell>
                          {r.done ? (
                            <span className="text-sm">{r.done.name}</span>
                          ) : (
                            <Badge className="border-transparent bg-terra-light text-[10px] text-terra-dark hover:bg-terra-light">
                              Ожидает
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.author?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky hover:text-brand"
                              onClick={() => {
                                setEditing(r);
                                setFormOpen(true);
                              }}
                              aria-label="Редактировать заявку"
                              title="Редактировать"
                            >
                              <Pencil className="h-4 w-4" strokeWidth={2} />
                            </Button>
                            {isMP && (
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
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
  assignedId: string;
  doneId: string;
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
      assignedId: "",
      doneId: "",
    };
  }
  return {
    date: request.date.slice(0, 10),
    patientName: request.patientName,
    doctorId: request.doctorId,
    lpuId: request.lpuId,
    destination: request.destination ?? "",
    assignedId: request.assignedId ?? "",
    doneId: request.doneId ?? "",
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
        destination: form.destination.trim() || null,
        assignedId: form.assignedId || null,
        doneId: form.doneId || null,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {request ? "Редактирование заявки" : "Регистрация заявки"}
          </DialogTitle>
          <DialogDescription>Учет направления пациента на обследование</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 1. Дата */}
          <div className="space-y-1.5">
            <Label>
              Дата <span className="text-terra-dark">*</span>
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
              ФИО пациента <span className="text-terra-dark">*</span>
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
              ФИО НВ <span className="text-terra-dark">*</span>
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
              ЛПУ <span className="text-terra-dark">*</span>
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

          {/* 5. Куда направление */}
          <div className="space-y-1.5">
            <Label>Куда направление</Label>
            <Input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder="Опционально — отделение, кабинет"
            />
          </div>

          {/* 6. Что назначено */}
          <div className="space-y-1.5">
            <Label>
              Что назначено <span className="text-terra-dark">*</span>
            </Label>
            <Select
              value={form.assignedId}
              onValueChange={(v) => setForm({ ...form, assignedId: v })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue
                  placeholder={
                    nomenclature?.length ? "Выберите позицию номенклатуры" : "Справочник номенклатуры пуст"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(nomenclature ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 7. Что сделано (опционально — можно заполнить позже) */}
          <div className="space-y-1.5">
            <Label>Что сделано</Label>
            <Select
              value={form.doneId || NONE}
              onValueChange={(v) => setForm({ ...form, doneId: v === NONE ? "" : v })}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Пока не выполнено" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Пока не выполнено</SelectItem>
                {(nomenclature ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Опционально — можно заполнить позже при редактировании заявки
            </p>
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
              !form.assignedId ||
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

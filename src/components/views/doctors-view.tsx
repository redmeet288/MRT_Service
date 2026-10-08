"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type {
  City,
  CityData,
  CooperationStatus,
  DoctorCard,
  DoctorItem,
  UserBasic,
  VisitItem,
} from "@/lib/types";
import {
  SectionCard,
  EmptyState,
  DeleteButton,
  StatusChip,
  fmtDate,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  ArrowRight,
  Building2,
  Cake,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Gift,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { useUiStore } from "@/store/ui";

const ALL = "__all__";
const NONE = "__none__";

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная зона) */
function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Редактируемый профиль НВ — общий для DoctorItem и DoctorCard */
type EditableDoctor = Pick<
  DoctorItem,
  "id" | "fullName" | "phone" | "birthDate" | "statusId" | "mpId" | "cityId" | "comment" | "lpus"
>;

interface DoctorFilters {
  q: string;
  mpId: string;
  statusId: string;
  lpuId: string;
  cityId: string;
}

const emptyFilters: DoctorFilters = { q: "", mpId: "", statusId: "", lpuId: "", cityId: "" };

/* ============================================================
   Вьюха «Направляющие врачи»
   ============================================================ */
export function DoctorsView() {
  const [filters, setFilters] = useState<DoctorFilters>(emptyFilters);
  const [formOpen, setFormOpen] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);

  const { data: doctors, isLoading } = useQuery<DoctorItem[]>({
    queryKey: ["doctors", "list", filters.q, filters.mpId, filters.statusId, filters.lpuId, filters.cityId],
    queryFn: () =>
      api.get(
        `/api/app/doctors${qs({
          q: filters.q,
          mpId: filters.mpId,
          statusId: filters.statusId,
          lpuId: filters.lpuId,
          cityId: filters.cityId,
        })}`
      ),
  });
  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["users-basic"],
    queryFn: () => api.get("/api/app/users?basic=1"),
  });
  const { data: statuses } = useQuery<CooperationStatus[]>({
    queryKey: ["statuses"],
    queryFn: () => api.get("/api/app/statuses"),
  });
  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });
  const { data: cities } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });

  const mps = useMemo(() => (users ?? []).filter((u) => u.role === "MP"), [users]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Направляющие врачи (НВ)"
        description="CRM-база врачей: привязки к ЛПУ, статус сотрудничества, визиты и заявки"
        action={
          <Button onClick={() => setFormOpen(true)} className="gap-1.5 bg-azure hover:bg-azure-dark">
            <Plus className="h-4 w-4" strokeWidth={2} /> Добавить врача
          </Button>
        }
      >
        <div className="space-y-5">
          {/* Панель фильтров */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Поиск по ФИО</Label>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky"
                  strokeWidth={2}
                />
                <Input
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Фамилия врача…"
                  className="w-52 bg-white pl-8"
                />
              </div>
            </div>
            <FilterSelect
              label="Курирующий МП"
              value={filters.mpId}
              onChange={(v) => setFilters((f) => ({ ...f, mpId: v }))}
              placeholder="Все МП"
              items={mps.map((m) => ({ value: m.id, label: m.name }))}
            />
            <FilterSelect
              label="Статус сотрудничества"
              value={filters.statusId}
              onChange={(v) => setFilters((f) => ({ ...f, statusId: v }))}
              placeholder="Все статусы"
              items={(statuses ?? []).map((s) => ({ value: s.id, label: s.name }))}
            />
            <FilterSelect
              label="ЛПУ"
              value={filters.lpuId}
              onChange={(v) => setFilters((f) => ({ ...f, lpuId: v }))}
              placeholder="Все ЛПУ"
              items={(lpus ?? []).map((l) => ({ value: l.id, label: l.name }))}
            />
            <FilterSelect
              label="Город"
              value={filters.cityId}
              onChange={(v) => setFilters((f) => ({ ...f, cityId: v }))}
              placeholder="Все города"
              items={(cities ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-sky hover:text-brand"
              onClick={() => setFilters(emptyFilters)}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} /> Сбросить
            </Button>
          </div>

          {/* Сетка карточек НВ */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : !doctors?.length ? (
            <EmptyState
              title="Врачи не найдены"
              hint="Измените параметры фильтра или добавьте нового направляющего врача"
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {doctors.length}</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {doctors.map((d) => (
                  <DoctorGridCard key={d.id} doctor={d} onOpen={() => setCardId(d.id)} />
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Диалог создания врача (монтируется при открытии — форма инициализируется заново) */}
      {formOpen && <DoctorFormDialog doctor={null} onOpenChange={setFormOpen} />}

      {/* CRM-карточка врача */}
      {cardId && (
        <DoctorCardDialog doctorId={cardId} onOpenChange={(o) => { if (!o) setCardId(null); }} />
      )}
    </div>
  );
}
export default DoctorsView;

/* ============================================================
   Карточка в сетке
   ============================================================ */
function DoctorGridCard({ doctor, onOpen }: { doctor: DoctorItem; onOpen: () => void }) {
  return (
    <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)] transition-colors hover:border-azure/40">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-brand" title={doctor.fullName}>
              {doctor.fullName}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="h-3 w-3 text-sky" strokeWidth={2} />
              МП: {doctor.mp.name}
            </p>
          </div>
          {doctor.status ? (
            <StatusPill status={doctor.status} />
          ) : (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Без статуса
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {doctor.lpus.length === 0 ? (
            <span className="text-xs italic text-muted-foreground">ЛПУ не привязаны</span>
          ) : (
            doctor.lpus.map(({ lpu }) => (
              <span
                key={lpu.id}
                className="inline-flex items-center gap-1 rounded-full bg-sky-light px-2 py-0.5 text-[11px] text-brand"
                title={`${lpu.city.name}${lpu.address ? `, ${lpu.address}` : ""}`}
              >
                <Building2 className="h-3 w-3 text-sky" strokeWidth={2} />
                {lpu.name}
              </span>
            ))
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 text-sky" strokeWidth={2} />
            {doctor.phone ?? "—"}
          </span>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="gap-1 border-border bg-white text-[11px] font-medium text-brand"
              title="Заявок"
            >
              <FileText className="h-3 w-3 text-sky" strokeWidth={2} />
              {doctor._count.requests}
            </Badge>
            <Badge
              variant="outline"
              className="gap-1 border-border bg-white text-[11px] font-medium text-brand"
              title="Визитов"
            >
              <CalendarDays className="h-3 w-3 text-sky" strokeWidth={2} />
              {doctor._count.visits}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-azure/40 px-2.5 text-xs text-azure hover:bg-azure hover:text-white"
              onClick={onOpen}
            >
              Карточка
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Диалог создания / редактирования врача
   ============================================================ */
interface DoctorFormState {
  fullName: string;
  phone: string;
  birthDate: string;
  statusId: string;
  mpId: string;
  cityId: string;
  lpuIds: string[];
  comment: string;
}

const emptyDoctorForm: DoctorFormState = {
  fullName: "",
  phone: "",
  birthDate: "",
  statusId: NONE,
  mpId: "",
  cityId: NONE,
  lpuIds: [],
  comment: "",
};

/** Начальное состояние формы: из карточки при редактировании / пустая при создании */
function initDoctorForm(doctor: EditableDoctor | null): DoctorFormState {
  if (!doctor) return emptyDoctorForm;
  return {
    fullName: doctor.fullName,
    phone: doctor.phone ?? "",
    birthDate: doctor.birthDate ? doctor.birthDate.slice(0, 10) : "",
    statusId: doctor.statusId ?? NONE,
    mpId: doctor.mpId,
    cityId: doctor.cityId ?? NONE,
    lpuIds: doctor.lpus?.map((x) => x.lpu.id) ?? [],
    comment: doctor.comment ?? "",
  };
}

function DoctorFormDialog({
  onOpenChange,
  doctor,
}: {
  onOpenChange: (o: boolean) => void;
  doctor: EditableDoctor | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DoctorFormState>(() => initDoctorForm(doctor));

  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["users-basic"],
    queryFn: () => api.get("/api/app/users?basic=1"),
  });
  const { data: statuses } = useQuery<CooperationStatus[]>({
    queryKey: ["statuses"],
    queryFn: () => api.get("/api/app/statuses"),
  });
  const { data: cities } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });
  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });

  const mps = useMemo(() => (users ?? []).filter((u) => u.role === "MP"), [users]);

  /** Переключение ЛПУ; автоподстановка города первого ЛПУ, если город не указан */
  function toggleLpu(id: string, checked: boolean) {
    setForm((f) => {
      const lpuIds = checked ? [...f.lpuIds, id] : f.lpuIds.filter((x) => x !== id);
      let cityId = f.cityId;
      if (checked && cityId === NONE && lpuIds.length > 0) {
        const first = lpus?.find((l) => l.id === lpuIds[0]);
        if (first) cityId = first.city.id;
      }
      return { ...f, lpuIds, cityId };
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        birthDate: form.birthDate || null,
        statusId: form.statusId === NONE ? null : form.statusId,
        mpId: form.mpId,
        cityId: form.cityId === NONE ? null : form.cityId,
        lpuIds: form.lpuIds,
        comment: form.comment.trim() || null,
      };
      return doctor ? api.put(`/api/app/doctors/${doctor.id}`, body) : api.post("/api/app/doctors", body);
    },
    onSuccess: () => {
      toast.success(doctor ? "Карточка врача обновлена" : "Врач добавлен");
      qc.invalidateQueries({ queryKey: ["doctors"] });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {doctor ? "Редактирование врача" : "Новый направляющий врач"}
          </DialogTitle>
          <DialogDescription>
            Карточка НВ — ключевая сущность CRM: статус, курирующий МП и привязки к ЛПУ
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              ФИО <span className="text-terra-dark">*</span>
            </Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Иванова Анна Петровна"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Телефон</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+7 (___) ___-__-__"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Дата рождения</Label>
            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Статус сотрудничества</Label>
            <Select value={form.statusId} onValueChange={(v) => setForm({ ...form, statusId: v })}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Выберите статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не указан</SelectItem>
                {(statuses ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Курирующий МП <span className="text-terra-dark">*</span>
            </Label>
            <Select value={form.mpId} onValueChange={(v) => setForm({ ...form, mpId: v })}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Выберите МП" />
              </SelectTrigger>
              <SelectContent>
                {mps.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Город</Label>
            <Select value={form.cityId} onValueChange={(v) => setForm({ ...form, cityId: v })}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Не указан" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не указан</SelectItem>
                {(cities ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Множественный выбор ЛПУ */}
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Привязка к ЛПУ</Label>
              <span className="text-[11px] text-muted-foreground">Выбрано: {form.lpuIds.length}</span>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-3">
              {!lpus?.length ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Сначала добавьте ЛПУ в разделе «Справочники»
                </p>
              ) : (
                lpus.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sky-light/60"
                  >
                    <Checkbox
                      checked={form.lpuIds.includes(l.id)}
                      onCheckedChange={(c) => toggleLpu(l.id, c === true)}
                      aria-label={`Привязать ${l.name}`}
                    />
                    <span className="text-sm text-brand">{l.name}</span>
                    <span className="text-xs text-muted-foreground">· {l.city.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              При выборе ЛПУ и незаполненном городе подставляется город первого ЛПУ
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Комментарий</Label>
            <Textarea
              rows={2}
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Особенности сотрудничества, заметки…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!form.fullName.trim() || !form.mpId || save.isPending}
            className="bg-azure hover:bg-azure-dark"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            {doctor ? "Сохранить" : "Добавить врача"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   CRM-карточка врача (большой диалог)
   ============================================================ */
interface VisitFormState {
  date: string;
  purpose: string;
  comment: string;
  lpuId: string;
}

function DoctorCardDialog({
  doctorId,
  onOpenChange,
}: {
  doctorId: string;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const { setActiveView } = useUiStore();
  const [editOpen, setEditOpen] = useState(false);
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [visitForm, setVisitForm] = useState<VisitFormState>({
    date: todayISO(),
    purpose: "",
    comment: "",
    lpuId: NONE,
  });

  const { data: card, isLoading } = useQuery<DoctorCard>({
    queryKey: ["doctor-card", doctorId],
    queryFn: () => api.get(`/api/app/doctors/${doctorId}`),
  });

  // Удаление врача — только МП
  const removeDoctor = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/doctors/${id}`),
    onSuccess: () => {
      toast.success("Врач удален");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["doctors"] });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Запланировать визит
  const addVisit = useMutation({
    mutationFn: () =>
      api.post("/api/app/visits", {
        doctorId,
        lpuId: visitForm.lpuId === NONE ? null : visitForm.lpuId,
        date: visitForm.date,
        purpose: visitForm.purpose.trim(),
        comment: visitForm.comment.trim() || null,
        status: "PLANNED",
      }),
    onSuccess: () => {
      toast.success("Визит запланирован");
      setVisitFormOpen(false);
      setVisitForm({ date: todayISO(), purpose: "", comment: "", lpuId: NONE });
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Смена статуса визита
  const setVisitStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VisitItem["status"] }) =>
      api.put(`/api/app/visits/${id}`, { status }),
    onSuccess: () => {
      toast.success("Статус визита обновлен");
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Удаление визита — только МП
  const removeVisit = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/visits/${id}`),
    onSuccess: () => {
      toast.success("Визит удален");
      qc.invalidateQueries({ queryKey: ["doctor-card"] });
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const doneCount = card?.requests.filter((r) => r.doneId != null).length ?? 0;

  const nextVisit = useMemo(() => {
    if (!card) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (
      [...card.visits]
        .filter((v) => v.status === "PLANNED" && new Date(v.date) >= start)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0] ?? null
    );
  }, [card]);

  const sortedVisits = useMemo(
    () => (card ? [...card.visits].sort((a, b) => +new Date(b.date) - +new Date(a.date)) : []),
    [card]
  );

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="flex flex-wrap items-center gap-2 font-display text-lg text-brand">
                  <span className="truncate">{card?.fullName ?? "Карточка врача"}</span>
                  {card?.status && <StatusPill status={card.status} />}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3 w-3 text-sky" strokeWidth={2} />
                    МП: {card?.mp.name ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3 text-sky" strokeWidth={2} />
                    {card?.phone ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Cake className="h-3 w-3 text-sky" strokeWidth={2} />
                    {card?.birthDate ? fmtDate(card.birthDate) : "дата рождения не указана"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-sky" strokeWidth={2} />
                    {card?.city?.name ?? "город не указан"}
                  </span>
                </DialogDescription>
              </div>
              {isMP && card && (
                <DeleteButton
                  title={`Удалить врача «${card.fullName}»?`}
                  description="Будут удалены карточка врача, привязки к ЛПУ, визиты и заявки. Действие будет зафиксировано в журнале аудита."
                  onConfirm={async () => {
                    try {
                      await removeDoctor.mutateAsync(card.id);
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                />
              )}
            </div>
          </DialogHeader>

          {isLoading || !card ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </div>
          ) : (
            <>
              {/* Quick-stats */}
              <div className="grid grid-cols-3 gap-3">
                <StatBox
                  icon={<FileText className="h-3.5 w-3.5 text-sky" strokeWidth={2} />}
                  label="Всего заявок"
                  value={card.requests.length}
                />
                <StatBox
                  icon={<CheckCircle2 className="h-3.5 w-3.5 text-sky" strokeWidth={2} />}
                  label="Выполнено"
                  value={doneCount}
                />
                <StatBox
                  icon={<CalendarDays className="h-3.5 w-3.5 text-sky" strokeWidth={2} />}
                  label="Ближайший визит"
                  value={nextVisit ? fmtDate(nextVisit.date) : "—"}
                />
              </div>

              <Tabs defaultValue="profile" className="mt-1">
                <TabsList className="h-10 bg-sky-light/60">
                  <TabsTrigger value="profile" className="px-4">Профиль и привязки</TabsTrigger>
                  <TabsTrigger value="visits" className="px-4">Визиты и коммуникации</TabsTrigger>
                  <TabsTrigger value="requests" className="px-4">Заявки ({card.requests.length})</TabsTrigger>
                </TabsList>

                {/* —— Вкладка: Профиль и привязки —— */}
                <TabsContent value="profile" className="mt-4 space-y-5">
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    <Field label="ФИО" value={card.fullName} />
                    <Field label="Телефон" value={card.phone ?? "—"} />
                    <Field label="Дата рождения" value={card.birthDate ? fmtDate(card.birthDate) : "—"} />
                    <Field label="Город" value={card.city?.name ?? "—"} />
                    <Field label="Курирующий МП" value={card.mp.name} />
                    <Field label="Статус сотрудничества" value={card.status?.name ?? "—"} />
                    <Field
                      label="Комментарий"
                      value={card.comment ?? "—"}
                      className="sm:col-span-2"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-brand">Привязки к ЛПУ</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-azure/40 text-azure hover:bg-azure hover:text-white"
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Редактировать
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {card.lpus.length === 0 ? (
                        <span className="text-xs italic text-muted-foreground">
                          ЛПУ не привязаны — нажмите «Редактировать»
                        </span>
                      ) : (
                        card.lpus.map(({ lpu }) => (
                          <span
                            key={lpu.id}
                            className="inline-flex items-center gap-1 rounded-full bg-sky-light px-2.5 py-1 text-xs text-brand"
                          >
                            <Building2 className="h-3 w-3 text-sky" strokeWidth={2} />
                            {lpu.name}
                            <span className="text-muted-foreground">· {lpu.city.name}</span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Задел этапа 2: бонусная программа */}
                  <div className="placeholder-section rounded-xl border-2 border-dashed border-sky/50 bg-soft p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <Gift className="h-4 w-4 text-sky" strokeWidth={2} />
                      <p className="font-display text-sm font-semibold text-muted-foreground">
                        Бонусная программа (этап 2)
                      </p>
                      <Badge
                        variant="outline"
                        className="border-terra/60 bg-terra-light text-[10px] text-terra-dark"
                      >
                        Задел
                      </Badge>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Тип программы</Label>
                        <Select disabled value={card.bonusType ?? ""}>
                          <SelectTrigger className="bg-white text-muted-foreground">
                            <SelectValue placeholder="Не выбран" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Денежный</SelectItem>
                            <SelectItem value="ACCUMULATIVE">Накопительный</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Текущий баланс</Label>
                        <Input
                          disabled
                          readOnly
                          value={String(card.bonusBalance ?? 0)}
                          className="bg-white text-muted-foreground"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Реквизиты для выплат</Label>
                        <Input
                          disabled
                          readOnly
                          value={card.payoutDetails ?? ""}
                          placeholder="Не указаны"
                          className="bg-white text-muted-foreground"
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Раздел будет активирован на этапе 2 — учет бонусных программ и выплат НВ.
                    </p>
                  </div>
                </TabsContent>

                {/* —— Вкладка: Визиты и коммуникации —— */}
                <TabsContent value="visits" className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">История визитов — всего {card.visits.length}</p>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-azure hover:bg-azure-dark"
                      onClick={() => setVisitFormOpen((o) => !o)}
                    >
                      <CalendarPlus className="h-4 w-4" strokeWidth={2} /> Запланировать визит
                    </Button>
                  </div>

                  {visitFormOpen && (
                    <div className="space-y-3 rounded-lg border border-azure/30 bg-sky-light/40 p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Дата визита <span className="text-terra-dark">*</span>
                          </Label>
                          <Input
                            type="date"
                            value={visitForm.date}
                            onChange={(e) => setVisitForm({ ...visitForm, date: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label className="text-xs">
                            Цель визита <span className="text-terra-dark">*</span>
                          </Label>
                          <Input
                            value={visitForm.purpose}
                            onChange={(e) => setVisitForm({ ...visitForm, purpose: e.target.value })}
                            placeholder="Например: презентация новой линейки МРТ"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">ЛПУ</Label>
                        <Select
                          value={visitForm.lpuId}
                          onValueChange={(v) => setVisitForm({ ...visitForm, lpuId: v })}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Выберите ЛПУ (необязательно)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Без привязки к ЛПУ</SelectItem>
                            {card.lpus.map(({ lpu }) => (
                              <SelectItem key={lpu.id} value={lpu.id}>
                                {lpu.name} · {lpu.city.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Комментарий</Label>
                        <Textarea
                          rows={2}
                          value={visitForm.comment}
                          onChange={(e) => setVisitForm({ ...visitForm, comment: e.target.value })}
                          placeholder="Договоренности, заметки о встрече…"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setVisitFormOpen(false)}>
                          Отмена
                        </Button>
                        <Button
                          size="sm"
                          className="bg-azure hover:bg-azure-dark"
                          disabled={!visitForm.date || !visitForm.purpose.trim() || addVisit.isPending}
                          onClick={() => addVisit.mutate()}
                        >
                          {addVisit.isPending && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                          Запланировать
                        </Button>
                      </div>
                    </div>
                  )}

                  {sortedVisits.length === 0 ? (
                    <EmptyState
                      title="Визитов пока нет"
                      hint="Запланируйте первую встречу с врачом — она появится в таймлайне"
                    />
                  ) : (
                    <ol className="relative ml-1 max-h-96 space-y-3 overflow-y-auto border-l border-sky/40 pl-5 pr-1">
                      {sortedVisits.map((v) => (
                        <li key={v.id} className="relative">
                          <span
                            className={`absolute -left-[26px] top-2.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                              v.status === "CONDUCTED" ? "bg-brand" : v.status === "CANCELLED" ? "bg-terra" : "bg-azure"
                            }`}
                          />
                          <div className="rounded-lg border border-border bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-display text-sm font-semibold text-brand">
                                {fmtDate(v.date)}
                              </span>
                              <StatusChip status={v.status} />
                            </div>
                            <p className="mt-1 text-sm">{v.purpose}</p>
                            {v.comment && (
                              <p className="mt-1 text-xs text-muted-foreground">{v.comment}</p>
                            )}
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                              {v.lpu && (
                                <span className="inline-flex items-center gap-1">
                                  <Building2 className="h-3 w-3 text-sky" strokeWidth={2} />
                                  {v.lpu.name}
                                </span>
                              )}
                              {v.mp && <span>МП: {v.mp.name}</span>}
                            </div>
                            {(v.status === "PLANNED" || isMP) && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {v.status === "PLANNED" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 border-brand/30 px-2 text-[11px] text-brand hover:bg-brand hover:text-white"
                                      onClick={() => setVisitStatus.mutate({ id: v.id, status: "CONDUCTED" })}
                                    >
                                      <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Проведен
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 border-terra/50 px-2 text-[11px] text-terra-dark hover:bg-terra hover:text-white"
                                      onClick={() => setVisitStatus.mutate({ id: v.id, status: "CANCELLED" })}
                                    >
                                      <XCircle className="h-3 w-3" strokeWidth={2} /> Отменен
                                    </Button>
                                  </>
                                )}
                                {isMP && (
                                  <DeleteButton
                                    title="Удалить визит?"
                                    description="Запись о визите будет удалена и зафиксирована в журнале аудита."
                                    onConfirm={async () => {
                                      try {
                                        await removeVisit.mutateAsync(v.id);
                                      } catch (e) {
                                        toast.error((e as Error).message);
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>

                {/* —— Вкладка: Заявки —— */}
                <TabsContent value="requests" className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Направления, зарегистрированные этим НВ — всего {card.requests.length}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-azure/40 text-azure hover:bg-azure hover:text-white"
                      onClick={() => {
                        onOpenChange(false);
                        setActiveView("requests");
                      }}
                    >
                      К заявкам <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </Button>
                  </div>
                  {card.requests.length === 0 ? (
                    <EmptyState title="Заявок нет" hint="Здесь появятся направления этого врача" />
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-white">
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Дата</TableHead>
                            <TableHead>Пациент</TableHead>
                            <TableHead>Назначено</TableHead>
                            <TableHead>Сделано</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {card.requests.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="whitespace-nowrap text-muted-foreground">
                                {fmtDate(r.date)}
                              </TableCell>
                              <TableCell className="font-medium text-brand">{r.patientName}</TableCell>
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
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования поверх карточки (монтируется при открытии) */}
      {editOpen && card && (
        <DoctorFormDialog doctor={card} onOpenChange={setEditOpen} />
      )}
    </>
  );
}

/* ============================================================
   Вспомогательные компоненты
   ============================================================ */

/** Бейдж статуса сотрудничества (цвет из справочника) */
function StatusPill({ status }: { status: CooperationStatus }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={{ borderColor: `${status.color}66`, color: status.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
      {status.name}
    </span>
  );
}

/** Селект фильтра с опцией «все» */
function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="w-44 bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Поле профиля «подпись — значение» */
function Field({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-sky">{label}</p>
      <p className="mt-0.5 break-words text-sm text-brand">{value}</p>
    </div>
  );
}

/** Мини-плитка quick-stats */
function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-sky-light/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 truncate font-display text-lg font-bold text-brand">{value}</p>
    </div>
  );
}

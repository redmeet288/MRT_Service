"use client";

// ============================================================
// Справочники (доработка 1.3):
// — клик по «Справочники» в боковой панели открывает страницу со
//   списком справочников: Направляющие врачи, ЛПУ, Города,
//   Номенклатура, Специализация, Статусы сотрудничества;
// — клик по названию открывает сам справочник;
// — каждый справочник визуально оформлен как «Список НВ»
//   (SectionCard + панель поиска + 1С-таблица с сортировкой);
// — во всех справочниках: настройка отображаемых столбцов
//   и их порядка (useDictColumns), импорт/экспорт с выбором
//   столбцов выгрузки;
// — «Направляющие врачи» — тоже справочник этого списка
//   (открывается полный список НВ).
// ============================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  City,
  CityData,
  CooperationStatus,
  DoctorItem,
  NomenclatureItem,
  Role,
  SpecializationItem,
} from "@/lib/types";
import { useUiStore } from "@/store/ui";
import {
  applySort,
  cycleSort,
  DeleteButton,
  EmptyState,
  RowsSkeleton,
  SectionCard,
  SortableTh,
  type SortState,
} from "@/components/shared/ui-bits";
import { useDictColumns, type DictCol } from "@/components/shared/dict-columns";
import { DictImportExport } from "@/components/shared/dict-io";
import { DoctorsView } from "@/components/views/doctors-view";
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
  ArrowLeft,
  ArrowRight,
  Building2,
  GraduationCap,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DictKey = "doctors" | "lpus" | "cities" | "nomenclature" | "specializations" | "statuses";

/** Сессия next-auth не содержит role — приводим к расширенному типу (как в doctors-view) */
type SessionUserWithRole = { uid?: string; role?: Role } | undefined;

/** Метаданные справочников для страницы-списка */
const DICT_ITEMS: Array<{
  key: DictKey;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    key: "doctors",
    title: "Направляющие врачи",
    description: "CRM-база врачей: статусы, МП, ЛПУ, заявки и визиты",
    icon: Stethoscope,
  },
  {
    key: "lpus",
    title: "ЛПУ",
    description: "Лечебно-профилактические учреждения: города, адреса, привязки",
    icon: Building2,
  },
  {
    key: "cities",
    title: "Города",
    description: "Города присутствия: привязки ЛПУ и врачей",
    icon: MapPin,
  },
  {
    key: "nomenclature",
    title: "Номенклатура",
    description: "Услуги и обследования для полей «Что назначено» и «Что сделано»",
    icon: ListChecks,
  },
  {
    key: "specializations",
    title: "Специализация",
    description: "Специализации врачей (мультивыбор в карточке НВ)",
    icon: GraduationCap,
  },
  {
    key: "statuses",
    title: "Статусы сотрудничества",
    description: "Варианты оформления НВ (ИП, СЗ, штат и др.)",
    icon: Tag,
  },
];

export function DictionariesView() {
  // Открытый справочник — одноразовый payload с дашборда (consumeDictTab), БЕЗ useEffect
  const [opened, setOpened] = useState<DictKey | null>(
    () => useUiStore.getState().consumeDictTab() ?? null
  );

  if (opened) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpened(null)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-azure transition-colors hover:text-azure-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
          aria-label="Вернуться к списку справочников"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Все справочники
        </button>
        {opened === "doctors" && <DoctorsView />}
        {opened === "cities" && <CitiesSection />}
        {opened === "lpus" && <LpusSection />}
        {opened === "nomenclature" && <NomenclatureSection />}
        {opened === "specializations" && <SpecializationsSection />}
        {opened === "statuses" && <StatusesSection />}
      </div>
    );
  }

  return <DictionariesLanding onOpen={setOpened} />;
}

/* ============================================================
   Страница-список справочников (что открывается по клику
   на «Справочники» в боковой панели)
   ============================================================ */

function DictionariesLanding({ onOpen }: { onOpen: (k: DictKey) => void }) {
  // Количество записей для карточек (данные кешируются и переиспользуются справочниками)
  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors"],
    queryFn: () => api.get("/api/app/doctors"),
  });
  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });
  const { data: cities } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });
  const { data: nomenclature } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature"],
    queryFn: () => api.get("/api/app/nomenclature"),
  });
  const { data: specializations } = useQuery<SpecializationItem[]>({
    queryKey: ["specializations"],
    queryFn: () => api.get("/api/app/specializations"),
  });
  const { data: statuses } = useQuery<CooperationStatus[]>({
    queryKey: ["statuses"],
    queryFn: () => api.get("/api/app/statuses"),
  });

  const counts: Record<DictKey, number | undefined> = {
    doctors: doctors?.length,
    lpus: lpus?.length,
    cities: cities?.length,
    nomenclature: nomenclature?.length,
    specializations: specializations?.length,
    statuses: statuses?.length,
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Выберите справочник — каждый открывается отдельным списком в стиле 1С с сортировкой,
        настройкой столбцов, импортом и экспортом.
      </p>
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        role="list"
        aria-label="Список справочников"
      >
        {DICT_ITEMS.map((item) => {
          const Icon = item.icon;
          const count = counts[item.key];
          return (
            <button
              key={item.key}
              type="button"
              role="listitem"
              onClick={() => onOpen(item.key)}
              aria-label={`Открыть справочник «${item.title}»`}
              className="group cursor-pointer rounded-xl border border-border bg-white p-5 text-left shadow-[0_2px_12px_rgba(25,70,136,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-azure/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-sky-light transition-colors group-hover:bg-azure/15">
                  <Icon className="h-5 w-5 text-azure" strokeWidth={2} aria-hidden="true" />
                </span>
                <ArrowRight
                  className="h-4 w-4 text-azure opacity-0 transition-opacity group-hover:opacity-100"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 font-display text-base font-semibold text-brand">{item.title}</p>
              <p className="mt-1 line-clamp-2 min-h-8 text-xs text-muted-foreground">
                {item.description}
              </p>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-sky">
                {count === undefined ? (
                  <span className="inline-block h-3 w-16 animate-pulse rounded bg-muted" aria-label="Загрузка количества записей" />
                ) : (
                  <>Записей: {count}</>
                )}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Общие элементы списка справочника (стиль «Список НВ»)
   ============================================================ */

/** Строка поиска в стиле списка НВ */
function DictSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky"
          strokeWidth={2}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-64 bg-white pl-8"
          aria-label={label}
        />
      </div>
    </div>
  );
}

/** Действия в строке: редактирование (по клику на название/карандаш) + удаление */
function DictRowActions({
  name,
  onEdit,
  onDelete,
}: {
  name: string;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-sky hover:text-brand"
        onClick={onEdit}
        aria-label={`Редактировать ${name}`}
        title="Редактировать"
      >
        <Pencil className="h-4 w-4" strokeWidth={2} />
      </Button>
      <DeleteButton
        title={`Удалить «${name}»?`}
        description="Действие будет зафиксировано в журнале аудита."
        onConfirm={onDelete}
      />
    </div>
  );
}


/** Шапка действия панели: импорт/экспорт + столбцы + «Добавить …» */
function DictActions({
  kind,
  visibleKeys,
  columnsButton,
  addLabel,
  onAdd,
}: {
  kind: "cities" | "lpus" | "nomenclature" | "specializations" | "statuses" | "doctors";
  visibleKeys: string[];
  columnsButton: React.ReactNode;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DictImportExport kind={kind} visibleKeys={visibleKeys} />
      {columnsButton}
      <Button onClick={onAdd} className="gap-1.5 bg-azure hover:bg-azure-dark">
        <Plus className="h-4 w-4" strokeWidth={2} /> {addLabel}
      </Button>
    </div>
  );
}

/* ============ Города ============ */

const CITY_COLS: DictCol[] = [
  { key: "name", label: "Название" },
  { key: "lpus", label: "ЛПУ" },
  { key: "doctors", label: "НВ" },
];

type CityDialogState = { mode: "create" } | { mode: "edit"; city: City } | null;

function CitiesSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [dialog, setDialog] = useState<CityDialogState>(null);
  const { visibleCols, settingsButton, settingsDialog } = useDictColumns("cities", CITY_COLS);

  const { data: cities, isLoading } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cities ?? [];
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [cities, search]);

  const sorted = useMemo(
    () =>
      applySort(filtered, sort, (c, f) => {
        switch (f) {
          case "name":
            return c.name;
          case "lpus":
            return c._count?.lpus ?? 0;
          case "doctors":
            return c._count?.doctors ?? 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/cities?id=${id}`),
    onSuccess: () => {
      toast.success("Город удален");
      qc.invalidateQueries({ queryKey: ["cities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderCell(c: City, key: string): React.ReactNode {
    switch (key) {
      case "name":
        return (
          <button
            type="button"
            className="font-medium text-azure hover:underline text-left"
            title="Изменить"
            onClick={() => setDialog({ mode: "edit", city: c })}
          >
            {c.name}
          </button>
        );
      case "lpus":
        return c._count?.lpus ?? 0;
      case "doctors":
        return c._count?.doctors ?? 0;
      default:
        return null;
    }
  }

  return (
    <>
      <SectionCard
        title="Города"
        description="Справочник городов: привязки ЛПУ и направляющих врачей"
        action={
          <DictActions
            kind="cities"
            visibleKeys={visibleCols.map((c) => c.key)}
            columnsButton={settingsButton}
            addLabel="Добавить город"
            onAdd={() => setDialog({ mode: "create" })}
          />
        }
      >
        <div className="space-y-4">
          <DictSearch
            value={search}
            onChange={setSearch}
            label="Поиск по названию"
            placeholder="Название города…"
          />
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Ничего не найдено" : "Городов пока нет"}
              hint={search ? "Измените условие поиска" : "Нажмите «Добавить город» или импортируйте список из файла"}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {filtered.length}</p>
              <div className="onec-window">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <SortableTh
                            key={col.key}
                            label={col.label}
                            field={col.key}
                            sort={sort}
                            onSort={(f) => setSort(cycleSort(sort, f))}
                          />
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c) => (
                        <tr key={c.id}>
                          {visibleCols.map((col) => (
                            <td key={col.key}>{renderCell(c, col.key)}</td>
                          ))}
                          <td>
                            <DictRowActions
                              name={c.name}
                              onEdit={() => setDialog({ mode: "edit", city: c })}
                              onDelete={async () => {
                                await remove.mutateAsync(c.id).catch(() => undefined);
                              }}
                            />
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
      {dialog && (
        <CityDialog editing={dialog.mode === "edit" ? dialog.city : null} onClose={() => setDialog(null)} />
      )}
      {settingsDialog}
    </>
  );
}

function CityDialog({ editing, onClose }: { editing: City | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => editing?.name ?? "");

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put("/api/app/cities", { id: editing.id, name })
        : api.post("/api/app/cities", { name }),
    onSuccess: () => {
      toast.success(editing ? "Город обновлен" : "Город добавлен");
      qc.invalidateQueries({ queryKey: ["cities"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {editing ? "Редактирование города" : "Новый город"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "Измените название и нажмите «Сохранить»." : "Введите название города — он станет доступен для ЛПУ и врачей."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Казань" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ ЛПУ ============ */

const LPU_COLS: DictCol[] = [
  { key: "name", label: "Название" },
  { key: "city", label: "Город" },
  { key: "address", label: "Адрес" },
  { key: "doctors", label: "НВ" },
  { key: "requests", label: "Заявки" },
];

type LpuDialogState = { mode: "create" } | { mode: "edit"; lpu: CityData } | null;

function LpusSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [dialog, setDialog] = useState<LpuDialogState>(null);
  const { visibleCols, settingsButton, settingsDialog } = useDictColumns("lpus", LPU_COLS);

  const { data: lpus, isLoading } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = lpus ?? [];
    return q ? list.filter((l) => l.name.toLowerCase().includes(q)) : list;
  }, [lpus, search]);

  const sorted = useMemo(
    () =>
      applySort(filtered, sort, (l, f) => {
        switch (f) {
          case "name":
            return l.name;
          case "city":
            return l.city.name;
          case "address":
            return l.address ?? "";
          case "doctors":
            return l._count?.doctors ?? 0;
          case "requests":
            return l._count?.requests ?? 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/lpus?id=${id}`),
    onSuccess: () => {
      toast.success("ЛПУ удалено");
      qc.invalidateQueries({ queryKey: ["lpus"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderCell(l: CityData, key: string): React.ReactNode {
    switch (key) {
      case "name":
        return (
          <button
            type="button"
            className="font-medium text-azure hover:underline text-left"
            title="Изменить"
            onClick={() => setDialog({ mode: "edit", lpu: l })}
          >
            {l.name}
          </button>
        );
      case "city":
        return l.city.name;
      case "address":
        return <span className="text-muted-foreground">{l.address ?? "—"}</span>;
      case "doctors":
        return l._count?.doctors ?? 0;
      case "requests":
        return l._count?.requests ?? 0;
      default:
        return null;
    }
  }

  return (
    <>
      <SectionCard
        title="ЛПУ"
        description="Лечебно-профилактические учреждения: города, адреса, привязки НВ"
        action={
          <DictActions
            kind="lpus"
            visibleKeys={visibleCols.map((c) => c.key)}
            columnsButton={settingsButton}
            addLabel="Добавить ЛПУ"
            onAdd={() => setDialog({ mode: "create" })}
          />
        }
      >
        <div className="space-y-4">
          <DictSearch
            value={search}
            onChange={setSearch}
            label="Поиск по названию"
            placeholder="Название ЛПУ…"
          />
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Ничего не найдено" : "ЛПУ пока не добавлены"}
              hint={search ? "Измените условие поиска" : "Нажмите «Добавить ЛПУ» или импортируйте список из файла"}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {filtered.length}</p>
              <div className="onec-window">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <SortableTh
                            key={col.key}
                            label={col.label}
                            field={col.key}
                            sort={sort}
                            onSort={(f) => setSort(cycleSort(sort, f))}
                          />
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((l) => (
                        <tr key={l.id}>
                          {visibleCols.map((col) => (
                            <td key={col.key}>{renderCell(l, col.key)}</td>
                          ))}
                          <td>
                            <DictRowActions
                              name={l.name}
                              onEdit={() => setDialog({ mode: "edit", lpu: l })}
                              onDelete={async () => {
                                await remove.mutateAsync(l.id).catch(() => undefined);
                              }}
                            />
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
      {dialog && (
        <LpuDialog editing={dialog.mode === "edit" ? dialog.lpu : null} onClose={() => setDialog(null)} />
      )}
      {settingsDialog}
    </>
  );
}

function LpuDialog({ editing, onClose }: { editing: CityData | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: editing?.name ?? "",
    cityId: editing?.city.id ?? "",
    address: editing?.address ?? "",
  }));

  const { data: cities } = useQuery<City[]>({
    queryKey: ["cities"],
    queryFn: () => api.get("/api/app/cities"),
  });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put("/api/app/lpus", { id: editing.id, ...form })
        : api.post("/api/app/lpus", form),
    onSuccess: () => {
      toast.success(editing ? "ЛПУ обновлено" : "ЛПУ добавлено");
      qc.invalidateQueries({ queryKey: ["lpus"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {editing ? "Редактирование ЛПУ" : "Новое ЛПУ"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "Измените реквизиты и нажмите «Сохранить»." : "Укажите название, город и адрес учреждения."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: ГКБ № 5" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Город</Label>
            {/* Radix Select не допускает value="" — пустое значение передаем как undefined (placeholder) */}
            <Select value={form.cityId || undefined} onValueChange={(v) => setForm({ ...form, cityId: v })}>
              <SelectTrigger><SelectValue placeholder="Выберите город" /></SelectTrigger>
              <SelectContent>
                {cities?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Адрес</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Улица, дом" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!form.name.trim() || !form.cityId || save.isPending}
          >
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Номенклатура ============ */

const NOM_COLS: DictCol[] = [
  { key: "name", label: "Наименование" },
  { key: "category", label: "Категория" },
  { key: "active", label: "Активна" },
];

type NomDialogState = { mode: "create" } | { mode: "edit"; item: NomenclatureItem } | null;

function NomenclatureSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [dialog, setDialog] = useState<NomDialogState>(null);
  const { visibleCols, settingsButton, settingsDialog } = useDictColumns("nomenclature", NOM_COLS);

  const { data: items, isLoading } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature"],
    queryFn: () => api.get("/api/app/nomenclature"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items ?? [];
    return q ? list.filter((n) => n.name.toLowerCase().includes(q)) : list;
  }, [items, search]);

  const sorted = useMemo(
    () =>
      applySort(filtered, sort, (n, f) => {
        switch (f) {
          case "name":
            return n.name;
          case "category":
            return n.category;
          case "active":
            return n.isActive ? 1 : 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ deactivated?: boolean }>(`/api/app/nomenclature?id=${id}`),
    onSuccess: (r: { deactivated?: boolean }) => {
      toast.success(r.deactivated ? "Позиция используется — деактивирована" : "Позиция удалена");
      qc.invalidateQueries({ queryKey: ["nomenclature"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderCell(n: NomenclatureItem, key: string): React.ReactNode {
    switch (key) {
      case "name":
        return (
          <button
            type="button"
            className={cn(
              "font-medium text-left hover:underline",
              n.isActive ? "text-azure" : "text-muted-foreground line-through"
            )}
            title="Изменить"
            onClick={() => setDialog({ mode: "edit", item: n })}
          >
            {n.name}
          </button>
        );
      case "category":
        return <span className="text-muted-foreground">{n.category}</span>;
      case "active":
        return n.isActive ? (
          <Badge variant="outline" className="bg-azure/10 text-azure-dark border-azure/30">да</Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">нет</Badge>
        );
      default:
        return null;
    }
  }

  return (
    <>
      <SectionCard
        title="Номенклатура"
        description="Услуги и обследования: используются в полях «Что назначено» и «Что сделано» заявки"
        action={
          <DictActions
            kind="nomenclature"
            visibleKeys={visibleCols.map((c) => c.key)}
            columnsButton={settingsButton}
            addLabel="Добавить позицию"
            onAdd={() => setDialog({ mode: "create" })}
          />
        }
      >
        <div className="space-y-4">
          <DictSearch
            value={search}
            onChange={setSearch}
            label="Поиск по наименованию"
            placeholder="Наименование…"
          />
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Ничего не найдено" : "Позиций пока нет"}
              hint={search ? "Измените условие поиска" : "Нажмите «Добавить позицию» или импортируйте список из файла"}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {filtered.length}</p>
              <div className="onec-window">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <SortableTh
                            key={col.key}
                            label={col.label}
                            field={col.key}
                            sort={sort}
                            onSort={(f) => setSort(cycleSort(sort, f))}
                          />
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((n) => (
                        <tr key={n.id}>
                          {visibleCols.map((col) => (
                            <td key={col.key}>{renderCell(n, col.key)}</td>
                          ))}
                          <td>
                            <DictRowActions
                              name={n.name}
                              onEdit={() => setDialog({ mode: "edit", item: n })}
                              onDelete={async () => {
                                await remove.mutateAsync(n.id).catch(() => undefined);
                              }}
                            />
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
      {dialog && (
        <NomenclatureDialog
          editing={dialog.mode === "edit" ? dialog.item : null}
          onClose={() => setDialog(null)}
        />
      )}
      {settingsDialog}
    </>
  );
}

function NomenclatureDialog({
  editing,
  onClose,
}: {
  editing: NomenclatureItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: editing?.name ?? "",
    category: editing?.category ?? "Обследования",
  }));

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put("/api/app/nomenclature", { id: editing.id, ...form })
        : api.post("/api/app/nomenclature", form),
    onSuccess: () => {
      toast.success(editing ? "Позиция обновлена" : "Позиция добавлена");
      qc.invalidateQueries({ queryKey: ["nomenclature"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {editing ? "Редактирование позиции" : "Новая позиция номенклатуры"}
          </DialogTitle>
          <DialogDescription>
            Справочник используется в полях «Что назначено» и «Что сделано» заявки.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Наименование</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: МРТ головного мозга" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Категория</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Обследования / Комплексные" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Специализация врача ============ */

const SPEC_COLS: DictCol[] = [
  { key: "name", label: "Название" },
  { key: "active", label: "Активна" },
  { key: "doctors", label: "НВ" },
];

type SpecDialogState = { mode: "create" } | { mode: "edit"; item: SpecializationItem } | null;

function SpecializationsSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [dialog, setDialog] = useState<SpecDialogState>(null);
  const { visibleCols, settingsButton, settingsDialog } = useDictColumns("specializations", SPEC_COLS);

  const { data: items, isLoading } = useQuery<SpecializationItem[]>({
    queryKey: ["specializations"],
    queryFn: () => api.get("/api/app/specializations"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items ?? [];
    return q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;
  }, [items, search]);

  const sorted = useMemo(
    () =>
      applySort(filtered, sort, (s, f) => {
        switch (f) {
          case "name":
            return s.name;
          case "active":
            return s.isActive ? 1 : 0;
          case "doctors":
            return s._count?.doctors ?? 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ deactivated?: boolean }>(`/api/app/specializations?id=${id}`),
    onSuccess: (r: { deactivated?: boolean }) => {
      toast.success(r.deactivated ? "Специализация используется — деактивирована" : "Специализация удалена");
      qc.invalidateQueries({ queryKey: ["specializations"] });
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderCell(s: SpecializationItem, key: string): React.ReactNode {
    switch (key) {
      case "name":
        return (
          <button
            type="button"
            className={cn(
              "font-medium text-left hover:underline",
              s.isActive ? "text-azure" : "text-muted-foreground line-through"
            )}
            title="Изменить"
            onClick={() => setDialog({ mode: "edit", item: s })}
          >
            {s.name}
          </button>
        );
      case "active":
        return s.isActive ? (
          <Badge variant="outline" className="bg-azure/10 text-azure-dark border-azure/30">да</Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">нет</Badge>
        );
      case "doctors":
        return s._count?.doctors ?? 0;
      default:
        return null;
    }
  }

  return (
    <>
      <SectionCard
        title="Специализация врача"
        description="Специализации направляющих врачей: мультивыбор в карточке НВ"
        action={
          <DictActions
            kind="specializations"
            visibleKeys={visibleCols.map((c) => c.key)}
            columnsButton={settingsButton}
            addLabel="Добавить специализацию"
            onAdd={() => setDialog({ mode: "create" })}
          />
        }
      >
        <div className="space-y-4">
          <DictSearch
            value={search}
            onChange={setSearch}
            label="Поиск по названию"
            placeholder="Название специализации…"
          />
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Ничего не найдено" : "Специализаций пока нет"}
              hint={search ? "Измените условие поиска" : "Нажмите «Добавить специализацию» или импортируйте список из файла"}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {filtered.length}</p>
              <div className="onec-window">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <SortableTh
                            key={col.key}
                            label={col.label}
                            field={col.key}
                            sort={sort}
                            onSort={(f) => setSort(cycleSort(sort, f))}
                          />
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s) => (
                        <tr key={s.id}>
                          {visibleCols.map((col) => (
                            <td key={col.key}>{renderCell(s, col.key)}</td>
                          ))}
                          <td>
                            <DictRowActions
                              name={s.name}
                              onEdit={() => setDialog({ mode: "edit", item: s })}
                              onDelete={async () => {
                                await remove.mutateAsync(s.id).catch(() => undefined);
                              }}
                            />
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
      {dialog && (
        <SpecializationDialog
          editing={dialog.mode === "edit" ? dialog.item : null}
          onClose={() => setDialog(null)}
        />
      )}
      {settingsDialog}
    </>
  );
}

function SpecializationDialog({ editing, onClose }: { editing: SpecializationItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => editing?.name ?? "");

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put("/api/app/specializations", { id: editing.id, name })
        : api.post("/api/app/specializations", { name }),
    onSuccess: () => {
      toast.success(editing ? "Специализация обновлена" : "Специализация добавлена");
      qc.invalidateQueries({ queryKey: ["specializations"] });
      qc.invalidateQueries({ queryKey: ["doctors"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {editing ? "Редактирование специализации" : "Новая специализация"}
          </DialogTitle>
          <DialogDescription>
            {editing ? "Измените название и нажмите «Сохранить»." : "Введите название специализации — она станет доступна в карточках НВ."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Врач-рентгенолог" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Статусы сотрудничества ============ */

const STATUS_COLS: DictCol[] = [
  { key: "name", label: "Название" },
  { key: "color", label: "Цвет" },
  { key: "doctors", label: "НВ" },
];

type StatusDialogState = { mode: "create" } | { mode: "edit"; item: CooperationStatus } | null;

function StatusesSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [dialog, setDialog] = useState<StatusDialogState>(null);
  const { visibleCols, settingsButton, settingsDialog } = useDictColumns("statuses", STATUS_COLS);

  const { data: items, isLoading } = useQuery<CooperationStatus[]>({
    queryKey: ["statuses"],
    queryFn: () => api.get("/api/app/statuses"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items ?? [];
    return q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;
  }, [items, search]);

  const sorted = useMemo(
    () =>
      applySort(filtered, sort, (s, f) => {
        switch (f) {
          case "name":
            return s.name;
          case "doctors":
            return s._count?.doctors ?? 0;
          default:
            return null;
        }
      }),
    [filtered, sort]
  );

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/statuses?id=${id}`),
    onSuccess: () => {
      toast.success("Статус удален");
      qc.invalidateQueries({ queryKey: ["statuses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function renderCell(s: CooperationStatus, key: string): React.ReactNode {
    switch (key) {
      case "name":
        return (
          <button
            type="button"
            className="font-medium text-azure hover:underline text-left"
            title="Изменить"
            onClick={() => setDialog({ mode: "edit", item: s })}
          >
            {s.name}
          </button>
        );
      case "color":
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full border border-black/10"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground text-xs">{s.color}</span>
          </span>
        );
      case "doctors":
        return s._count?.doctors ?? 0;
      default:
        return null;
    }
  }

  return (
    <>
      <SectionCard
        title="Статусы сотрудничества"
        description="Варианты оформления НВ (ИП, СЗ, штат и др.) — цвет используется в бейджах карточек врачей"
        action={
          <DictActions
            kind="statuses"
            visibleKeys={visibleCols.map((c) => c.key)}
            columnsButton={settingsButton}
            addLabel="Добавить статус"
            onAdd={() => setDialog({ mode: "create" })}
          />
        }
      >
        <div className="space-y-4">
          <DictSearch
            value={search}
            onChange={setSearch}
            label="Поиск по названию"
            placeholder="Название статуса…"
          />
          {isLoading ? (
            <RowsSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Ничего не найдено" : "Статусов пока нет"}
              hint={search ? "Измените условие поиска" : "Нажмите «Добавить статус» или импортируйте список из файла"}
            />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Найдено: {filtered.length}</p>
              <div className="onec-window">
                <div className="max-h-96 overflow-y-auto">
                  <table className="onec-table">
                    <thead>
                      <tr>
                        {visibleCols.map((col) => (
                          <SortableTh
                            key={col.key}
                            label={col.label}
                            field={col.key}
                            sort={sort}
                            onSort={(f) => setSort(cycleSort(sort, f))}
                          />
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s) => (
                        <tr key={s.id}>
                          {visibleCols.map((col) => (
                            <td key={col.key}>{renderCell(s, col.key)}</td>
                          ))}
                          <td>
                            <DictRowActions
                              name={s.name}
                              onEdit={() => setDialog({ mode: "edit", item: s })}
                              onDelete={async () => {
                                await remove.mutateAsync(s.id).catch(() => undefined);
                              }}
                            />
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
      {dialog && (
        <StatusDialog
          editing={dialog.mode === "edit" ? dialog.item : null}
          onClose={() => setDialog(null)}
        />
      )}
      {settingsDialog}
    </>
  );
}

function StatusDialog({
  editing,
  onClose,
}: {
  editing: CooperationStatus | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    name: editing?.name ?? "",
    color: editing?.color ?? "#7692cb",
  }));

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.put("/api/app/statuses", { id: editing.id, ...form })
        : api.post("/api/app/statuses", form),
    onSuccess: () => {
      toast.success(editing ? "Статус обновлен" : "Статус добавлен");
      qc.invalidateQueries({ queryKey: ["statuses"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">
            {editing ? "Редактирование статуса" : "Новый статус сотрудничества"}
          </DialogTitle>
          <DialogDescription>
            Варианты оформления НВ (ИП, СЗ, штат и др.) — цвет используется в бейджах карточек врачей.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: ИП" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Цвет</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-md border border-border bg-white p-1"
                aria-label="Цвет статуса"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-32 font-mono text-sm"
                placeholder="#7692cb"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
            {editing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


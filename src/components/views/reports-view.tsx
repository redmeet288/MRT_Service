"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart3,
  Bookmark,
  Building2,
  CheckCircle2,
  Coins,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Package,
  Play,
  Save,
  SlidersHorizontal,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { api, qs } from "@/lib/api-client";
import type {
  CityData,
  DoctorItem,
  NomenclatureItem,
  ReportGroupNode,
  ReportPreset,
  ReportRequestRow,
  ReportV2Response,
  UserBasic,
} from "@/lib/types";
import {
  DeleteButton,
  EmptyState,
  RowsSkeleton,
  SortableTh,
  applySort,
  cycleSort,
  fmtDate,
  fmtDateTime,
  type SortState,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ============================================================
   Отчет «По обследованиям» в стиле 1С:Предприятие:
   окно формы + панель инструментов с желтой кнопкой
   «Сформировать», строка «Параметры: …», иерархическая таблица
   с деревом групп (рекурсивные ReportGroupNode) и строкой «Итого».
   Отчет строится ТОЛЬКО по нажатию кнопки (как в 1С).
   ============================================================ */

type ReportVariant = ReportV2Response["variant"];

const VARIANT_LABELS: Record<ReportVariant, string> = {
  mp: "По МП",
  lpu: "По ЛПУ",
  doctor: "По НВ",
  nomenclature: "По Номенклатуре",
};

const GROUP_BY_LABELS: Record<ReportVariant, string> = {
  mp: "МП → ЛПУ → НВ",
  lpu: "ЛПУ → НВ",
  doctor: "НВ",
  nomenclature: "Номенклатура",
};

const LEVEL_ICONS: Record<ReportGroupNode["level"], React.ElementType> = {
  mp: UserRound,
  lpu: Building2,
  doctor: Stethoscope,
  nomenclature: Package,
};

interface ReportFilters {
  from: string;
  to: string;
  mpId: string;
  lpuId: string;
  doctorId: string;
  assignedId: string;
  done: string; // "" | "1" | "0"
  variant: ReportVariant;
}

function defaultFilters(): ReportFilters {
  return {
    from: format(subDays(new Date(), 90), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
    mpId: "",
    lpuId: "",
    doctorId: "",
    assignedId: "",
    done: "",
    variant: "mp",
  };
}

/* ============================================================ */

/**
 * Загрузка TTF-шрифта с кириллицей (PT Sans, /public/fonts/pdf) для PDF-экспорта.
 * Стандартные шрифты jsPDF кириллицу не поддерживают — шрифт регистрируется в VFS.
 */
async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить шрифт для PDF (${res.status})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* ============================================================ */

const pct = (done: number, total: number) =>
  total > 0 ? Math.round((done / total) * 100) : 0;

function pctBadgeClass(p: number): string {
  if (p >= 66) return "bg-azure/15 text-azure-dark";
  if (p >= 33) return "bg-sky-light text-brand";
  return "bg-muted text-muted-foreground";
}

/* —— Плоские строки экспорта: обход рекурсивного дерева —— */

interface ExportRow {
  mp: string;
  lpu: string;
  city: string;
  doctor: string;
  nom: string;
  date: string;
  patient: string;
  destination: string;
  assigned: string;
  done: string;
}

type GroupCtx = { mp?: string; lpu?: string; city?: string; doctor?: string; nom?: string };

function collectRows(node: ReportGroupNode, ctx: GroupCtx, out: ExportRow[]): void {
  const next: GroupCtx = { ...ctx };
  if (node.level === "mp") next.mp = node.name;
  else if (node.level === "lpu") {
    next.lpu = node.name;
    next.city = node.subtitle || ctx.city || "";
  } else if (node.level === "doctor") next.doctor = node.name;
  else next.nom = node.name;

  if (node.children.length) {
    node.children.forEach((child) => collectRows(child, next, out));
  } else {
    node.requests.forEach((r) =>
      out.push({
        mp: next.mp ?? r.mpName ?? "",
        lpu: next.lpu ?? r.lpuName ?? "",
        city: next.city ?? r.cityName ?? "",
        doctor: next.doctor ?? r.doctorName ?? "",
        nom: next.nom ?? r.assigned ?? "",
        date: fmtDate(r.date),
        patient: r.patientName,
        destination: r.destination ?? "—",
        assigned: r.assigned ?? "—",
        done: r.done ?? "Не выполнено",
      })
    );
  }
}

type ExportColKey = keyof ExportRow;

/** Колонки экспорта по варианту отчета */
const EXPORT_COLS: Record<ReportVariant, Array<{ key: ExportColKey; title: string }>> = {
  mp: [
    { key: "mp", title: "МП" },
    { key: "lpu", title: "ЛПУ" },
    { key: "city", title: "Город" },
    { key: "doctor", title: "НВ" },
    { key: "date", title: "Дата" },
    { key: "patient", title: "Пациент" },
    { key: "destination", title: "Куда направление" },
    { key: "assigned", title: "Что назначено" },
    { key: "done", title: "Что сделано" },
  ],
  lpu: [
    { key: "lpu", title: "ЛПУ" },
    { key: "city", title: "Город" },
    { key: "doctor", title: "НВ" },
    { key: "date", title: "Дата" },
    { key: "patient", title: "Пациент" },
    { key: "destination", title: "Куда направление" },
    { key: "assigned", title: "Что назначено" },
    { key: "done", title: "Что сделано" },
  ],
  doctor: [
    { key: "doctor", title: "НВ" },
    { key: "lpu", title: "ЛПУ" },
    { key: "mp", title: "МП" },
    { key: "date", title: "Дата" },
    { key: "patient", title: "Пациент" },
    { key: "destination", title: "Куда направление" },
    { key: "assigned", title: "Что назначено" },
    { key: "done", title: "Что сделано" },
  ],
  nomenclature: [
    { key: "nom", title: "Номенклатура" },
    { key: "date", title: "Дата" },
    { key: "patient", title: "Пациент" },
    { key: "doctor", title: "НВ" },
    { key: "lpu", title: "ЛПУ" },
    { key: "mp", title: "МП" },
    { key: "destination", title: "Куда направление" },
    { key: "assigned", title: "Что назначено" },
    { key: "done", title: "Что сделано" },
  ],
};

/* —— Колонки детализации в таблице (зависят от варианта) —— */

type DetailKey = "date" | "patient" | "doctor" | "lpu" | "mp" | "destination" | "assigned" | "done";

function buildDetailCols(variant: ReportVariant): Array<{ key: DetailKey; label: string }> {
  const cols: Array<{ key: DetailKey; label: string }> = [
    { key: "date", label: "Дата" },
    { key: "patient", label: "Пациент" },
  ];
  if (variant !== "doctor") cols.push({ key: "doctor", label: "НВ" });
  if (variant !== "lpu") cols.push({ key: "lpu", label: "ЛПУ" });
  if (variant === "doctor" || variant === "nomenclature") cols.push({ key: "mp", label: "МП" });
  cols.push(
    { key: "destination", label: "Куда направление" },
    { key: "assigned", label: "Что назначено" },
    { key: "done", label: "Что сделано" }
  );
  return cols;
}

/** Геттер значения детальной строки для сортировки по столбцу */
function detailValue(
  r: ReportRequestRow,
  field: string
): string | number | null | undefined {
  switch (field) {
    case "date":
      return r.date;
    case "patient":
      return r.patientName;
    case "doctor":
      return r.doctorName ?? "";
    case "lpu":
      return r.lpuName ?? "";
    case "mp":
      return r.mpName ?? "";
    case "destination":
      return r.destination ?? "";
    case "assigned":
      return r.assigned ?? "";
    case "done":
      return r.done ?? "";
    default:
      return null;
  }
}

/** Значение детальной строки для Excel-экспорта (текстовые представления как на экране) */
function reportDetailValue(r: ReportRequestRow, key: DetailKey): string {
  switch (key) {
    case "date":
      return fmtDate(r.date);
    case "patient":
      return r.patientName;
    case "doctor":
      return r.doctorName ?? "";
    case "lpu":
      return r.lpuName ?? "";
    case "mp":
      return r.mpName ?? "";
    case "destination":
      return r.destination ?? "";
    case "assigned":
      return r.assigned ?? "";
    case "done":
      return r.done || "Ожидает";
    default:
      return "";
  }
}

/* —— Состояние раскрытия дерева: первый уровень раскрыт по умолчанию —— */

interface TreeExpansion {
  /** глубже первого уровня: раскрыты вручную */
  open: Set<string>;
  /** первый уровень: свернуты вручную */
  closed: Set<string>;
}

const EMPTY_EXPANSION: TreeExpansion = { open: new Set(), closed: new Set() };

/* ============================================================
   Основной компонент
   ============================================================ */

export function ReportsView() {
  const qc = useQueryClient();

  // —— Настройки (черновик) vs примененные фильтры (отчет строится по кнопке) ——
  const [draft, setDraft] = useState<ReportFilters>(defaultFilters);
  const [applied, setApplied] = useState<ReportFilters | null>(null);
  const [runId, setRunId] = useState(0);

  // —— Служебные состояния ——
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [treeState, setTreeState] = useState<TreeExpansion>(EMPTY_EXPANSION);
  // —— Сортировка: группы верхнего уровня + детальные строки внутри листьев ——
  const [groupSort, setGroupSort] = useState<SortState | null>(null);
  const [detailSort, setDetailSort] = useState<SortState | null>(null);

  // —— Справочники ——
  const { data: users } = useQuery<UserBasic[]>({
    queryKey: ["users-basic"],
    queryFn: () => api.get("/api/app/users?basic=1"),
  });
  const mps = useMemo(() => (users ?? []).filter((u) => u.role === "MP"), [users]);

  const { data: lpus } = useQuery<CityData[]>({
    queryKey: ["lpus"],
    queryFn: () => api.get("/api/app/lpus"),
  });

  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors"],
    queryFn: () => api.get("/api/app/doctors"),
  });
  const doctorOptions = useMemo(
    () => (doctors ?? []).filter((d) => !draft.mpId || d.mpId === draft.mpId),
    [doctors, draft.mpId]
  );

  const { data: nomenclature } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature-active"],
    queryFn: () => api.get("/api/app/nomenclature?active=1"),
  });

  const { data: presets } = useQuery<ReportPreset[]>({
    queryKey: ["presets"],
    queryFn: () => api.get("/api/app/presets"),
  });

  // —— Отчет: включается только после нажатия «Сформировать» ——
  const reportQuery = useQuery<ReportV2Response>({
    queryKey: [
      "report-examinations-v2",
      runId,
      applied?.from ?? "",
      applied?.to ?? "",
      applied?.mpId ?? "",
      applied?.lpuId ?? "",
      applied?.doctorId ?? "",
      applied?.assignedId ?? "",
      applied?.done ?? "",
      applied?.variant ?? "",
    ],
    queryFn: async () => {
      if (!applied) throw new Error("Отчет не сформирован");
      return api.get<ReportV2Response>(
        `/api/app/reports/examinations${qs({
          from: applied.from,
          to: `${applied.to}T23:59:59`,
          mpId: applied.mpId,
          lpuId: applied.lpuId,
          doctorId: applied.doctorId,
          assignedId: applied.assignedId,
          done: applied.done,
          variant: applied.variant,
        })}`
      );
    },
    enabled: Boolean(applied),
    staleTime: Infinity, // данные «заморожены» до следующего «Сформировать»
    refetchOnWindowFocus: false,
  });
  const data = reportQuery.data;

  // Вариант сформированного отчета (для шапки таблицы и экспорта)
  const variant: ReportVariant = data?.variant ?? applied?.variant ?? "mp";
  const show = {
    nv: variant !== "doctor",
    lpu: variant !== "lpu",
    mp: variant === "doctor" || variant === "nomenclature",
  };
  const detailCols = buildDetailCols(variant);
  const detailSpan = 1 + detailCols.length;

  const doneTotal = useMemo(
    () => (data?.tree ?? []).reduce((s, n) => s + n.done, 0),
    [data]
  );

  // —— Сортировка групп верхнего уровня (дети следуют за родителем; «Итого» — всегда последней строкой) ——
  const sortedTree = useMemo(() => {
    const tree = data?.tree ?? [];
    return applySort(tree, groupSort, (node, field) => {
      if (field === "name") return node.name;
      if (field === "total") return node.total;
      if (field === "done") return node.done;
      if (field === "pct") return node.total > 0 ? node.done / node.total : 0;
      return null;
    });
  }, [data, groupSort]);

  // —— Переключатели сортировки: цикл «нет → asc → desc → нет» ——
  const sortGroups = (field: string) => setGroupSort((prev) => cycleSort(prev, field));
  const sortDetails = (field: string) => setDetailSort((prev) => cycleSort(prev, field));

  // —— Плоские строки для экспорта ——
  const flatRows = useMemo<ExportRow[]>(() => {
    if (!data) return [];
    const out: ExportRow[] = [];
    data.tree.forEach((n) => collectRows(n, {}, out));
    return out;
  }, [data]);
  const canExport = Boolean(data && flatRows.length);

  // —— Строка «Параметры: …» по примененным фильтрам ——
  const appliedParts = useMemo(() => {
    if (!applied) return [];
    const parts: string[] = [`Период: ${fmtDate(applied.from)} – ${fmtDate(applied.to)}`];
    if (applied.mpId)
      parts.push(`МП: ${(users ?? []).find((u) => u.id === applied.mpId)?.name ?? "—"}`);
    if (applied.lpuId)
      parts.push(`ЛПУ: ${(lpus ?? []).find((l) => l.id === applied.lpuId)?.name ?? "—"}`);
    if (applied.doctorId)
      parts.push(`НВ: ${(doctors ?? []).find((d) => d.id === applied.doctorId)?.fullName ?? "—"}`);
    if (applied.assignedId)
      parts.push(
        `Назначено: ${(nomenclature ?? []).find((n) => n.id === applied.assignedId)?.name ?? "—"}`
      );
    if (applied.done) parts.push(applied.done === "1" ? "Выполненные" : "Невыполненные");
    parts.push(`Вариант: ${VARIANT_LABELS[applied.variant]}`);
    return parts;
  }, [applied, users, lpus, doctors, nomenclature]);

  // Настройки отличаются от примененных → подсказка про «Сформировать»
  const dirty = useMemo(() => {
    if (!applied) return false;
    return (
      applied.from !== draft.from ||
      applied.to !== draft.to ||
      applied.mpId !== draft.mpId ||
      applied.lpuId !== draft.lpuId ||
      applied.doctorId !== draft.doctorId ||
      applied.assignedId !== draft.assignedId ||
      applied.done !== draft.done ||
      applied.variant !== draft.variant
    );
  }, [applied, draft]);

  function patchDraft(patch: Partial<ReportFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  /** «Сформировать» — единственный способ (пере)построить отчет */
  function formReport() {
    const next: ReportFilters = { ...draft };
    setApplied(next);
    setRunId((r) => r + 1);
    setTreeState({ open: new Set(), closed: new Set() }); // сброс дерева: раскрыт 1-й уровень
    setDetailSort(null);
    setGroupSort(null);
    setSettingsOpen(false);
  }

  // —— Управление деревом (контролируемое, ключ уникален по пути) ——
  function toggleNode(key: string, depth: number) {
    setTreeState((prev) => {
      const open = new Set(prev.open);
      const closed = new Set(prev.closed);
      const isOpen = !closed.has(key) && (depth === 0 || open.has(key));
      if (isOpen) {
        open.delete(key);
        closed.add(key);
      } else {
        open.add(key);
        closed.delete(key);
      }
      return { open, closed };
    });
  }

  // —— Аудит экспорта (ТЗ п.8) — фиксация до формирования файла ——
  async function logExport(kind: "Excel" | "PDF") {
    try {
      await api.post("/api/app/audit", {
        action: "EXPORT",
        entity: "report",
        details: `Экспорт отчета «По обследованиям» (${VARIANT_LABELS[variant]}): ${flatRows.length} строк, период ${applied?.from ?? ""}–${applied?.to ?? ""}, формат ${kind}`,
      });
    } catch {
      // журнал аудита не блокирует выгрузку
    }
  }

  async function doExport(kind: "Excel" | "PDF") {
    if (!flatRows.length) {
      toast.error("Нет данных для экспорта");
      return;
    }
    await logExport(kind);
    const cols = EXPORT_COLS[variant];

    if (kind === "Excel") {
      // Иерархический лист: группы с деревом (сворачивание уровней через outline),
      // детальные строки под каждой группой, «Итого по отчету» в конце
      const ws = buildHierarchicalWorksheet();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Отчет");
      XLSX.writeFile(wb, "otchet-po-obsledovaniyam.xlsx");
    } else {
      // PDF — кириллицей (PT Sans подключается в VFS jsPDF)
      const [regular, bold] = await Promise.all([
        fetchFontBase64("/fonts/pdf/PTSans-Regular.ttf"),
        fetchFontBase64("/fonts/pdf/PTSans-Bold.ttf"),
      ]);
      const doc = new jsPDF({ orientation: "landscape" });
      doc.addFileToVFS("PTSans-Regular.ttf", regular);
      doc.addFont("PTSans-Regular.ttf", "PTSans", "normal");
      doc.addFileToVFS("PTSans-Bold.ttf", bold);
      doc.addFont("PTSans-Bold.ttf", "PTSans", "bold");

      doc.setFont("PTSans", "bold");
      doc.setFontSize(13);
      doc.setTextColor(25, 70, 136);
      doc.text("Отчет по обследованиям", 14, 15);
      doc.setFont("PTSans", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(appliedParts.join(" · "), 14, 21, { maxWidth: 275 });

      autoTable(doc, {
        startY: 25,
        head: [cols.map((c) => c.title)],
        body: flatRows.map((r) => cols.map((c) => String(r[c.key] ?? ""))),
        styles: { fontSize: 7.5, cellPadding: 2.5, font: "PTSans" },
        headStyles: { fillColor: [25, 70, 136], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [227, 234, 248] },
      });
      doc.save("otchet-po-obsledovaniyam.pdf");
    }
    toast.success(`Экспорт ${kind} выполнен: ${flatRows.length} строк`);
  }

  /**
   * Иерархический лист Excel (доработка 1.3): группы и подгруппы сохраняются
   * как строки с outline-уровнями — в Excel они сворачиваются/разворачиваются
   * кнопками «+/−» (summary-строка группы — над детальными строками).
   */
  function buildHierarchicalWorksheet(): XLSX.WorkSheet {
    const cols = buildDetailCols(variant);
    const colCount = 1 + cols.length + 3; // Наименование + детализация + Всего/Выполнено/%

    const aoa: (string | number)[][] = [];
    const rowsMeta: XLSX.RowInfo[] = [];

    const pushRow = (cells: (string | number)[], level?: number) => {
      aoa.push(cells);
      rowsMeta.push({ level });
    };

    const groupCells = (name: string, depth: number, total: number, done: number) => {
      const cells: (string | number)[] = new Array(colCount).fill("");
      cells[0] = "    ".repeat(depth) + name;
      cells[colCount - 3] = total;
      cells[colCount - 2] = done;
      cells[colCount - 1] = `${pct(done, total)}%`;
      return cells;
    };

    // Шапка листа: название отчета + строка параметров
    pushRow(["Отчет по обследованиям"]);
    pushRow([`Параметры: ${appliedParts.join(" · ")}`]);
    pushRow([]);
    // Заголовок таблицы
    pushRow(["Наименование", ...cols.map((c) => c.label), "Всего", "Выполнено", "%"]);

    function walk(node: ReportGroupNode, depth: number) {
      pushRow(
        groupCells(node.name + (node.subtitle ? ` · ${node.subtitle}` : ""), depth, node.total, node.done),
        depth
      );
      if (node.children.length) {
        node.children.forEach((child) => walk(child, depth + 1));
      } else {
        node.requests.forEach((r) => {
          const cells: (string | number)[] = new Array(colCount).fill("");
          cols.forEach((c, i) => {
            cells[1 + i] = reportDetailValue(r, c.key);
          });
          pushRow(cells, depth + 1);
        });
      }
    }
    (data?.tree ?? []).forEach((n) => walk(n, 0));

    // Итог по отчету
    pushRow(groupCells("Итого по отчету", 0, data?.total ?? 0, doneTotal));

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!rows"] = rowsMeta;
    // summary-строка (группа) располагается НАД своими строками — кнопки «+/−»
    // в Excel отображаются у строки группы
    (ws as XLSX.WorkSheet & { "!outline"?: { above?: boolean; left?: boolean } })["!outline"] = {
      above: true,
    };
    ws["!cols"] = [
      { wch: 46 },
      ...cols.map((c) => ({ wch: c.key === "date" ? 12 : c.key === "patient" ? 24 : 18 })),
      { wch: 8 },
      { wch: 11 },
      { wch: 7 },
    ];
    return ws;
  }

  // —— Мутации пресетов ——
  const savePreset = useMutation({
    mutationFn: () =>
      api.post("/api/app/presets", {
        name: presetName.trim(),
        reportKey: "examinations",
        filters: {
          from: draft.from,
          to: draft.to,
          mpId: draft.mpId,
          lpuId: draft.lpuId,
          doctorId: draft.doctorId,
          assignedId: draft.assignedId,
          done: draft.done,
          variant: draft.variant,
        },
      }),
    onSuccess: () => {
      toast.success("Пресет сохранен");
      setPresetName("");
      setSaveOpen(false);
      qc.invalidateQueries({ queryKey: ["presets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePreset = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/presets/${id}`),
    onSuccess: () => {
      toast.success("Пресет удален");
      qc.invalidateQueries({ queryKey: ["presets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Применение пресета: подставляет настройки и сразу формирует отчет */
  function applyPreset(p: ReportPreset) {
    try {
      const f = JSON.parse(p.filtersJson) as Partial<ReportFilters>;
      const def = defaultFilters();
      const next: ReportFilters = {
        from: f.from || def.from,
        to: f.to || def.to,
        mpId: f.mpId ?? "",
        lpuId: f.lpuId ?? "",
        doctorId: f.doctorId ?? "",
        assignedId: f.assignedId ?? "",
        done: f.done ?? "",
        variant:
          f.variant && f.variant in VARIANT_LABELS ? (f.variant as ReportVariant) : "mp",
      };
      setDraft(next);
      setApplied(next);
      setRunId((r) => r + 1);
      setTreeState({ open: new Set(), closed: new Set() });
      setDetailSort(null);
      setGroupSort(null);
      setPresetsOpen(false);
      toast.success(`Пресет «${p.name}» применен — отчет сформирован`);
    } catch {
      toast.error("Не удалось применить пресет");
    }
  }

  return (
    <div className="space-y-4">
      <div className="onec-window">
        {/* —— Заголовок формы (1С) —— */}
        <div className="onec-titlebar">
          <BarChart3 className="h-4 w-4 text-[#8a8a8a]" strokeWidth={2} />
          <h2 className="text-[13px] font-semibold text-[#1c1c1c]">
            Отчет по обследованиям
          </h2>
          <span className="ml-auto hidden text-[11px] text-[#9a9a9a] sm:inline">
            Форма отчета · дерево групп · детализация заявок
          </span>
        </div>

        {/* —— Панель инструментов (1С) —— */}
        <div className="onec-toolbar" role="toolbar" aria-label="Панель инструментов отчета">
          <button
            type="button"
            className="onec-btn onec-btn-primary"
            onClick={formReport}
            disabled={reportQuery.isFetching}
          >
            {reportQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
            ) : (
              <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            Сформировать
          </button>
          <button type="button" className="onec-btn" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            Настройки…
          </button>

          <span className="mx-1.5 h-4 w-px bg-[#d9d9d9]" aria-hidden />

          <label className="flex items-center gap-1.5 text-[11.5px] text-[#5a5a5a]">
            Вариант:
            <select
              className="onec-search w-[160px] cursor-pointer"
              value={draft.variant}
              onChange={(e) => patchDraft({ variant: e.target.value as ReportVariant })}
              aria-label="Вариант отчета"
            >
              <option value="mp">По МП</option>
              <option value="lpu">По ЛПУ</option>
              <option value="doctor">По НВ</option>
              <option value="nomenclature">По Номенклатуре</option>
            </select>
          </label>

          <span className="mx-1.5 h-4 w-px bg-[#d9d9d9]" aria-hidden />

          <button
            type="button"
            className="onec-btn"
            onClick={() => doExport("Excel")}
            disabled={!canExport}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} />
            Экспорт Excel
          </button>
          <button
            type="button"
            className="onec-btn"
            onClick={() => doExport("PDF")}
            disabled={!canExport}
          >
            <FileDown className="h-3.5 w-3.5" strokeWidth={2} />
            Экспорт PDF
          </button>

          <span className="mx-1.5 h-4 w-px bg-[#d9d9d9]" aria-hidden />

          <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="onec-btn">
                <Bookmark className="h-3.5 w-3.5" strokeWidth={2} />
                Пресеты…{presets?.length ? ` (${presets.length})` : ""}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              {!presets?.length ? (
                <p className="p-2 text-xs text-muted-foreground">
                  Пресетов пока нет — настройте параметры и нажмите «Сохранить как…».
                </p>
              ) : (
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-sky-light/60"
                    >
                      <button
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-brand">
                          {p.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Сохранен {fmtDate(p.createdAt)}
                        </span>
                      </button>
                      <DeleteButton
                        title={`Удалить пресет «${p.name}»?`}
                        onConfirm={async () => {
                          await removePreset.mutateAsync(p.id);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <button type="button" className="onec-btn" onClick={() => setSaveOpen(true)}>
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
            Сохранить как…
          </button>
        </div>

        {/* —— Строка параметров (как в 1С) —— */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-[#e4e4e4] bg-white px-3 py-2 text-[12px] text-[#3a3a3a]">
          <span className="font-semibold text-[#1c1c1c]">Параметры:</span>
          {applied ? (
            <>
              {appliedParts.map((part, i) => (
                <span key={`${i}-${part}`} className="whitespace-nowrap">
                  {i > 0 && <span className="mr-1.5 text-[#c9c9c9]">·</span>}
                  {part}
                </span>
              ))}
              {data && (
                <span className="whitespace-nowrap">
                  <span className="mr-1.5 text-[#c9c9c9]">·</span>
                  Сформирован: {fmtDateTime(data.generatedAt)}
                </span>
              )}
              {dirty && (
                <span className="whitespace-nowrap text-azure-dark">
                  · настройки изменены — нажмите «Сформировать»
                </span>
              )}
            </>
          ) : (
            <span className="text-[#9a9a9a]">
              отчет не сформирован — задайте настройки и нажмите «Сформировать»
            </span>
          )}
          {reportQuery.isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-azure" aria-label="Формирование отчета" />
          )}
        </div>

        {/* —— Табличное поле отчета —— */}
        <div className="bg-white">
          {reportQuery.error ? (
            <div className="m-3 rounded-md border border-azure/40 bg-sky-light p-4 text-sm text-brand-dark">
              Не удалось построить отчет: {(reportQuery.error as Error).message}
            </div>
          ) : reportQuery.isPending || !data ? (
            applied ? (
              <div className="p-3">
                <RowsSkeleton rows={8} />
              </div>
            ) : (
              <EmptyState
                title="Отчет не сформирован"
                hint="Задайте период и фильтры в «Настройках», затем нажмите синюю кнопку «Сформировать» — как в 1С, отчет строится только по команде."
                className="py-14"
              />
            )
          ) : data.tree.length === 0 ? (
            <EmptyState
              title="Нет заявок за выбранный период"
              hint="Измените настройки или расширьте период и нажмите «Сформировать»"
              className="py-14"
            />
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="onec-table">
                <caption className="sr-only">
                  Отчет по обследованиям — иерархическая таблица с деревом групп
                </caption>
                <thead>
                  <tr>
                    <SortableTh
                      className="min-w-[280px]"
                      label={`Наименование · группировка: ${GROUP_BY_LABELS[variant]}`}
                      field="name"
                      sort={groupSort}
                      onSort={sortGroups}
                      ariaLabel="Сортировать по наименованию"
                    />
                    {detailCols.map((c) => (
                      <SortableTh
                        key={c.key}
                        className={c.key === "date" ? "whitespace-nowrap" : undefined}
                        label={c.label}
                        field={c.key}
                        sort={detailSort}
                        onSort={sortDetails}
                      />
                    ))}
                    <SortableTh
                      label="Всего"
                      field="total"
                      sort={groupSort}
                      onSort={sortGroups}
                      align="right"
                    />
                    <SortableTh
                      label="Выполнено"
                      field="done"
                      sort={groupSort}
                      onSort={sortGroups}
                      align="right"
                    />
                    <SortableTh
                      label="%"
                      field="pct"
                      sort={groupSort}
                      onSort={sortGroups}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedTree.map((node) => (
                    <TreeRows
                      key={node.id}
                      node={node}
                      depth={0}
                      parentKey="r"
                      detailSpan={detailSpan}
                      show={show}
                      expansion={treeState}
                      onToggle={toggleNode}
                      detailSort={detailSort}
                      onDetailSort={sortDetails}
                    />
                  ))}
                  {/* —— Итого по отчету —— */}
                  <tr className="onec-row-total">
                    <td colSpan={detailSpan}>Итого по отчету</td>
                    <td style={{ textAlign: "right" }}>{data.total}</td>
                    <td style={{ textAlign: "right" }}>{doneTotal}</td>
                    <td style={{ textAlign: "right" }}>
                      {pct(doneTotal, data.total)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* —— Диалог «Настройки отчета» —— */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">
              Настройки отчета «По обследованиям»
            </DialogTitle>
            <DialogDescription>
              Задайте параметры отбора. Отчет строится по кнопке «Сформировать».
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-1 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Период с</Label>
              <Input
                type="date"
                value={draft.from}
                onChange={(e) => patchDraft({ from: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Период по</Label>
              <Input
                type="date"
                value={draft.to}
                onChange={(e) => patchDraft({ to: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Медицинский представитель</Label>
              <Select
                value={draft.mpId || "ALL"}
                onValueChange={(v) => patchDraft({ mpId: v === "ALL" ? "" : v, doctorId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все МП" />
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
              <Label className="text-xs text-muted-foreground">ЛПУ</Label>
              <Select
                value={draft.lpuId || "ALL"}
                onValueChange={(v) => patchDraft({ lpuId: v === "ALL" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все ЛПУ" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Все ЛПУ</SelectItem>
                  {(lpus ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Направляющий врач (НВ)</Label>
              <Select
                value={draft.doctorId || "ALL"}
                onValueChange={(v) => patchDraft({ doctorId: v === "ALL" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={draft.mpId ? "Все НВ выбранного МП" : "Все НВ"} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">
                    {draft.mpId ? "Все НВ выбранного МП" : "Все НВ"}
                  </SelectItem>
                  {doctorOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Что назначено</Label>
              <Select
                value={draft.assignedId || "ALL"}
                onValueChange={(v) => patchDraft({ assignedId: v === "ALL" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Любое назначение" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="ALL">Любое назначение</SelectItem>
                  {(nomenclature ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Выполненность</Label>
              <Select
                value={draft.done || "ALL"}
                onValueChange={(v) => patchDraft({ done: v === "ALL" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Все</SelectItem>
                  <SelectItem value="1">Только выполненные</SelectItem>
                  <SelectItem value="0">Только невыполненные</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Задел этапа 2: колонка «Начисленный бонус» */}
            <div
              className="flex items-center gap-2.5 self-end rounded-lg border border-dashed border-sky/50 bg-soft px-3 py-2.5 sm:col-span-2"
              title="Функционал этапа 2 — бонусная система"
            >
              <Coins className="h-4 w-4 text-sky/70" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-tight text-brand">
                  Колонка «Начисленный бонус»
                </p>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Этап 2 · бонусная система
                </p>
              </div>
              <Switch
                checked={false}
                disabled
                aria-readonly
                aria-label="Колонка «Начисленный бонус» — этап 2"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Закрыть
            </Button>
            <button type="button" className="onec-btn onec-btn-primary" onClick={formReport}>
              <Play className="h-3.5 w-3.5" strokeWidth={2.5} />
              Сформировать
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* —— Диалог сохранения пресета —— */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">
              Сохранить пресет настроек
            </DialogTitle>
            <DialogDescription>
              Пресет доступен только вам в списке «Пресеты…».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Название пресета</Label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Например: Квартал · МРТ головы"
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) savePreset.mutate();
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Сохраняются: период, вариант отчета, МП, ЛПУ, НВ, назначение, выполненность.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => savePreset.mutate()}
              disabled={!presetName.trim() || savePreset.isPending}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   Рекурсивная строка-группа дерева отчета (.onec-row-group)
   ============================================================ */

function TreeRows({
  node,
  depth,
  parentKey,
  detailSpan,
  show,
  expansion,
  onToggle,
  detailSort,
  onDetailSort,
}: {
  node: ReportGroupNode;
  depth: number;
  parentKey: string;
  detailSpan: number;
  show: { nv: boolean; lpu: boolean; mp: boolean };
  expansion: TreeExpansion;
  onToggle: (key: string, depth: number) => void;
  detailSort?: SortState | null;
  onDetailSort?: (field: string) => void;
}) {
  // Уникальный ключ по пути в дереве: level:id на каждом уровне
  const key = `${parentKey}/${depth}:${node.level}:${node.id}`;
  const open = !expansion.closed.has(key) && (depth === 0 || expansion.open.has(key));
  const hasChildren = node.children.length > 0;
  const hasContent = hasChildren || node.requests.length > 0;
  const Icon = LEVEL_ICONS[node.level] ?? Building2;
  const p = pct(node.done, node.total);

  // Детальные строки листа: клиентская сортировка по столбцам детализации
  const sortedRequests = useMemo(
    () => applySort(node.requests, detailSort ?? null, detailValue),
    [node.requests, detailSort]
  );

  return (
    <>
      <tr className="onec-row-group">
        <td colSpan={detailSpan}>
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
            {hasContent ? (
              <button
                type="button"
                className="onec-tree-toggle"
                aria-expanded={open}
                aria-label={open ? `Свернуть группу «${node.name}»` : `Развернуть группу «${node.name}»`}
                onClick={() => onToggle(key, depth)}
              >
                {open ? "−" : "+"}
              </button>
            ) : (
              <span className="inline-block h-[15px] w-[15px] shrink-0" aria-hidden />
            )}
            <Icon className="h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={2} />
            <span className="text-[13px] text-[#1c1c1c]">{node.name}</span>
            {node.subtitle && (
              <span className="font-normal text-[11px] text-[#8a8a8a]">· {node.subtitle}</span>
            )}
          </div>
        </td>
        <td style={{ textAlign: "right" }}>{node.total}</td>
        <td style={{ textAlign: "right" }}>{node.done}</td>
        <td style={{ textAlign: "right" }}>
          <span
            className={cn(
              "inline-block rounded-full px-1.5 py-[1px] text-[10px] font-semibold",
              pctBadgeClass(p)
            )}
          >
            {p}%
          </span>
        </td>
      </tr>

      {/* Дочерние группы */}
      {open &&
        hasChildren &&
        node.children.map((child) => (
          <TreeRows
            key={child.id}
            node={child}
            depth={depth + 1}
            parentKey={key}
            detailSpan={detailSpan}
            show={show}
            expansion={expansion}
            onToggle={onToggle}
            detailSort={detailSort}
            onDetailSort={onDetailSort}
          />
        ))}

      {/* Листья: детальные строки заявок */}
      {open &&
        !hasChildren &&
        (node.requests.length ? (
          sortedRequests.map((r) => <DetailRow key={r.id} r={r} show={show} />)
        ) : (
          <tr>
            <td colSpan={detailSpan + 3} className="italic text-[#9a9a9a]" style={{ fontSize: 12 }}>
              Нет записей в группе
            </td>
          </tr>
        ))}
    </>
  );
}

/* ============ Детальная строка заявки (колонки по варианту) ============ */

function DetailRow({
  r,
  show,
}: {
  r: ReportRequestRow;
  show: { nv: boolean; lpu: boolean; mp: boolean };
}) {
  return (
    <tr>
      <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
      <td style={{ fontWeight: 500 }}>{r.patientName}</td>
      {show.nv && <td>{r.doctorName}</td>}
      {show.lpu && <td>{r.lpuName}</td>}
      {show.mp && <td>{r.mpName}</td>}
      <td>{r.destination ?? "—"}</td>
      <td>{r.assigned ?? "—"}</td>
      <td>
        {r.done ? (
          <span className="inline-flex items-center gap-1 text-azure-dark">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
            {r.done}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-sky-light px-2 py-0.5 text-[10px] font-semibold text-brand">
            Ожидает
          </span>
        )}
      </td>
      {/* Пустые ячейки под колонки «Всего / Выполнено / %» */}
      <td />
      <td />
      <td />
    </tr>
  );
}

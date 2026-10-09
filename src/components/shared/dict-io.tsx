"use client";

// ============================================================
// DictImportExport — общий блок импорта/экспорта справочников.
// Рендерит ФРАГМЕНТ 1С-тулбара (кнопки «Импорт из файла…» и «Экспорт»),
// парсинг XLSX/CSV выполняется на клиенте, отправка — POST /api/app/import.
//
// Экспорт (доработка 1.3): перед выгрузкой открывается диалог выбора
// столбцов — выгружаются только отмеченные, в заданном порядке.
// Заголовки в файле — русские; импорт понимает и русские заголовки,
// и технические ключи шаблонов (см. HEADER_ALIASES).
// ============================================================

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type {
  City,
  CityData,
  CooperationStatus,
  DoctorItem,
  ImportResult,
  NomenclatureItem,
  SpecializationItem,
} from "@/lib/types";
import type { DictCol } from "@/components/shared/dict-columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DictKind = "cities" | "lpus" | "nomenclature" | "statuses" | "doctors" | "specializations";

type ParsedRow = Record<string, string>;
type ExportRow = Record<string, string | number>;

const PREVIEW_COUNT = 8;

interface DictIOConfig {
  /** Название справочника для диалога */
  title: string;
  /** Первая строка — заголовки, далее 2 примера строки */
  templateAoa: string[][];
  /** Обязательные колонки (нормализованы: trim + lowercase) */
  required: string[];
  /** Колонки превью */
  previewCols: { key: string; label: string }[];
  /** Преобразование строки файла в объект для POST /api/app/import */
  toApiRow: (r: ParsedRow) => Record<string, string>;
  /** Загрузка данных справочника (GET /api/app/…) в строки keyed by exportCols */
  fetchExportRows: () => Promise<ExportRow[]>;
  /** Столбцы, доступные для экспорта (выбор в диалоге) */
  exportCols: DictCol[];
  templateFile: string;
  exportFile: string;
  sheetName: string;
  /** Подсказка о колонках под drop-зоной */
  hint: string;
}

/** Русские заголовки (из экспорта) → технические ключи импорта */
const HEADER_ALIASES: Record<DictKind, Record<string, string>> = {
  cities: { "название": "name" },
  lpus: { "название": "name", "город": "city", "адрес": "address" },
  nomenclature: {
    "наименование": "name",
    "категория": "category",
    "активна": "isactive",
    "активна (да/нет)": "isactive",
  },
  statuses: { "название": "name", "цвет": "color", "цвет (hex)": "color" },
  doctors: {
    "фио": "fullname",
    "телефон": "phone",
    "дата рождения": "birthdate",
    "статус": "status",
    "город": "city",
    "мп": "mplogin",
    "лпу": "lpus",
  },
  specializations: { "название": "name" },
};

const DICT_CONFIG: Record<DictKind, DictIOConfig> = {
  cities: {
    title: "Города",
    templateFile: "shablon-goroda.xlsx",
    exportFile: "goroda.xlsx",
    sheetName: "Города",
    templateAoa: [["name"], ["Москва"], ["Казань"]],
    required: ["name"],
    previewCols: [{ key: "name", label: "Название" }],
    toApiRow: (r) => ({ name: r.name ?? "" }),
    fetchExportRows: async () => {
      const data = await api.get<City[]>("/api/app/cities");
      return data.map((c) => ({
        name: c.name,
        lpus: c._count?.lpus ?? 0,
        doctors: c._count?.doctors ?? 0,
      }));
    },
    exportCols: [
      { key: "name", label: "Название" },
      { key: "lpus", label: "ЛПУ" },
      { key: "doctors", label: "НВ" },
    ],
    hint: "Колонка name (обязательна) — название города. Повторные города пропускаются как дубли.",
  },
  lpus: {
    title: "ЛПУ",
    templateFile: "shablon-lpu.xlsx",
    exportFile: "lpu.xlsx",
    sheetName: "ЛПУ",
    templateAoa: [
      ["name", "city", "address"],
      ["ГКБ № 5", "Москва", "ул. Строителей, 4"],
      ["Поликлиника № 2", "Казань", "ул. Баумана, 10"],
    ],
    required: ["name", "city"],
    previewCols: [
      { key: "name", label: "Название" },
      { key: "city", label: "Город" },
      { key: "address", label: "Адрес" },
    ],
    toApiRow: (r) => ({ name: r.name ?? "", city: r.city ?? "", address: r.address ?? "" }),
    fetchExportRows: async () => {
      const data = await api.get<CityData[]>("/api/app/lpus");
      return data.map((l) => ({
        name: l.name,
        city: l.city.name,
        address: l.address ?? "",
        doctors: l._count?.doctors ?? 0,
        requests: l._count?.requests ?? 0,
      }));
    },
    exportCols: [
      { key: "name", label: "Название" },
      { key: "city", label: "Город" },
      { key: "address", label: "Адрес" },
      { key: "doctors", label: "НВ" },
      { key: "requests", label: "Заявки" },
    ],
    hint: "name и city обязательны; город создается автоматически, если его еще нет.",
  },
  nomenclature: {
    title: "Номенклатура",
    templateFile: "shablon-nomenklatura.xlsx",
    exportFile: "nomenklatura.xlsx",
    sheetName: "Номенклатура",
    templateAoa: [
      ["name", "category", "isActive"],
      ["МРТ головного мозга", "Обследования", "да"],
      ["МРТ всего тела (комплекс)", "Комплексные", "нет"],
    ],
    required: ["name"],
    previewCols: [
      { key: "name", label: "Наименование" },
      { key: "category", label: "Категория" },
      { key: "isactive", label: "Активна (да/нет)" },
    ],
    toApiRow: (r) => ({
      name: r.name ?? "",
      category: r.category ?? "",
      isActive: r.isactive ?? "да",
    }),
    fetchExportRows: async () => {
      const data = await api.get<NomenclatureItem[]>("/api/app/nomenclature");
      return data.map((n) => ({
        name: n.name,
        category: n.category,
        active: n.isActive ? "да" : "нет",
      }));
    },
    exportCols: [
      { key: "name", label: "Наименование" },
      { key: "category", label: "Категория" },
      { key: "active", label: "Активна" },
    ],
    hint: "name обязательна; category (по умолчанию «Обследования»), isActive — «да»/«нет».",
  },
  statuses: {
    title: "Статусы сотрудничества",
    templateFile: "shablon-statusy.xlsx",
    exportFile: "statusy-sotrudnichestva.xlsx",
    sheetName: "Статусы",
    templateAoa: [
      ["name", "color"],
      ["ИП", "#0196d2"],
      ["СЗ", "#e8a486"],
    ],
    required: ["name"],
    previewCols: [
      { key: "name", label: "Название" },
      { key: "color", label: "Цвет (HEX)" },
    ],
    toApiRow: (r) => ({ name: r.name ?? "", color: r.color ?? "" }),
    fetchExportRows: async () => {
      const data = await api.get<CooperationStatus[]>("/api/app/statuses");
      return data.map((s) => ({
        name: s.name,
        color: s.color,
        doctors: s._count?.doctors ?? 0,
      }));
    },
    exportCols: [
      { key: "name", label: "Название" },
      { key: "color", label: "Цвет (HEX)" },
      { key: "doctors", label: "НВ" },
    ],
    hint: "name обязательна; color — HEX-код (например #0196d2), иначе будет подобран цвет по умолчанию.",
  },
  doctors: {
    title: "Врачи (НВ)",
    templateFile: "shablon-nv.xlsx",
    exportFile: "vrachi-nv.xlsx",
    sheetName: "Врачи",
    templateAoa: [
      ["fullName", "phone", "birthDate", "status", "city", "mpLogin", "lpus"],
      ["Иванов Алексей Борисович", "+7 900 000-00-00", "12.05.1980", "ИП", "Москва", "m.ivanova", "ГКБ № 5;Поликлиника № 2"],
      ["Петрова Вера Геннадьевна", "+7 900 111-11-11", "01.09.1975", "СЗ", "Казань", "", "ГКБ № 5"],
    ],
    required: ["fullname"],
    previewCols: [
      { key: "fullname", label: "ФИО" },
      { key: "phone", label: "Телефон" },
      { key: "birthdate", label: "Дата рождения" },
      { key: "status", label: "Статус" },
      { key: "city", label: "Город" },
      { key: "mplogin", label: "Логин МП" },
      { key: "lpus", label: "ЛПУ" },
    ],
    toApiRow: (r) => ({
      fullName: r.fullname ?? "",
      phone: r.phone ?? "",
      birthDate: r.birthdate ?? "",
      status: r.status ?? "",
      city: r.city ?? "",
      mpLogin: r.mplogin ?? "",
      lpus: r.lpus ?? "",
    }),
    fetchExportRows: async () => {
      const data = await api.get<DoctorItem[]>("/api/app/doctors");
      return data.map((d) => ({
        fullName: d.fullName,
        phone: d.phone ?? "",
        birthDate: d.birthDate ? d.birthDate.slice(0, 10).split("-").reverse().join(".") : "",
        status: d.status?.name ?? "",
        city: d.city?.name ?? "",
        // логин МП API не отдает — выгружаем имя (при повторном импорте колонка игнорируется)
        mp: d.mp?.name ?? "",
        lpus: d.lpus.map((x) => x.lpu.name).join(";"),
      }));
    },
    exportCols: [
      { key: "fullName", label: "ФИО" },
      { key: "phone", label: "Телефон" },
      { key: "birthDate", label: "Дата рождения" },
      { key: "status", label: "Статус" },
      { key: "city", label: "Город" },
      { key: "mp", label: "МП" },
      { key: "lpus", label: "ЛПУ" },
    ],
    hint: "name обязательна; mpLogin необязателен (НВ без МП создастся без куратора); lpus — названия через «;»; даты в формате ДД.ММ.ГГГГ.",
  },
  specializations: {
    title: "Специализация врача",
    templateFile: "shablon-specializacii.xlsx",
    exportFile: "specializacii-vrachey.xlsx",
    sheetName: "Специализации",
    templateAoa: [
      ["name"],
      ["Неврология"],
      ["Травматология-ортопедия"],
    ],
    required: ["name"],
    previewCols: [{ key: "name", label: "Название" }],
    toApiRow: (r) => ({ name: r.name ?? "" }),
    fetchExportRows: async () => {
      const data = await api.get<SpecializationItem[]>("/api/app/specializations");
      return data.map((s) => ({
        name: s.name,
        active: s.isActive ? "да" : "нет",
        doctors: s._count?.doctors ?? 0,
      }));
    },
    exportCols: [
      { key: "name", label: "Название" },
      { key: "active", label: "Активна" },
      { key: "doctors", label: "НВ" },
    ],
    hint: "Колонка name (обязательна) — название специализации. Повторные записи пропускаются как дубли.",
  },
};

export function DictImportExport({
  kind,
  visibleKeys,
  onImported,
}: {
  kind: DictKind;
  /** Ключи видимых столбцов таблицы — они предотмечены в диалоге экспорта */
  visibleKeys?: string[];
  onImported?: () => void;
}) {
  const cfg = DICT_CONFIG[kind];
  const qc = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Экспорт выбранных столбцов: GET данных → json_to_sheet → скачивание файла */
  async function handleExport(selectedCols: DictCol[]) {
    setExporting(true);
    try {
      const rows = await cfg.fetchExportRows();
      if (!rows.length) {
        toast.error("Справочник пуст — нечего экспортировать");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(
        rows.map((r) => Object.fromEntries(selectedCols.map((c) => [c.label, r[c.key] ?? ""])))
      );
      ws["!cols"] = selectedCols.map((c) => ({ wch: Math.max(12, Math.min(42, c.label.length + 8)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName);
      XLSX.writeFile(wb, cfg.exportFile);
      toast.success(`Экспортировано строк: ${rows.length} · столбцов: ${selectedCols.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка экспорта");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <button type="button" className="onec-btn" onClick={() => setImportOpen(true)}>
        <Upload className="h-3.5 w-3.5" strokeWidth={2} />
        Импорт из файла…
      </button>
      <button type="button" className="onec-btn" onClick={() => setExportOpen(true)} disabled={exporting}>
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        Экспорт
      </button>
      {importOpen && (
        <DictImportDialog
          kind={kind}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            qc.invalidateQueries();
            onImported?.();
          }}
        />
      )}
      {exportOpen && (
        <ExportColumnsDialog
          title={cfg.title}
          cols={cfg.exportCols}
          defaultKeys={
            visibleKeys && visibleKeys.length
              ? visibleKeys.filter((k) => cfg.exportCols.some((c) => c.key === k))
              : cfg.exportCols.map((c) => c.key)
          }
          exporting={exporting}
          onClose={() => setExportOpen(false)}
          onExport={(cols) => void handleExport(cols)}
        />
      )}
    </>
  );
}

/* ============================================================
   Диалог выбора столбцов экспорта (доработка 1.3)
   ============================================================ */

function ExportColumnsDialog({
  title,
  cols,
  defaultKeys,
  exporting,
  onClose,
  onExport,
}: {
  title: string;
  cols: DictCol[];
  defaultKeys: string[];
  exporting: boolean;
  onClose: () => void;
  onExport: (cols: DictCol[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    cols.map((c) => c.key).filter((k) => defaultKeys.includes(k))
  );

  function toggle(key: string, checked: boolean) {
    setSelected((prev) =>
      checked ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)
    );
  }

  const orderedSelected = cols.filter((c) => selected.includes(c.key));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">Экспорт — {title}</DialogTitle>
          <DialogDescription>
            Отметьте столбцы, которые нужно выгрузить в файл Excel. Порядок столбцов в файле
            соответствует списку ниже.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-white p-2">
          {cols.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sky-light/60"
            >
              <Checkbox
                checked={selected.includes(c.key)}
                onCheckedChange={(checked) => toggle(c.key, checked === true)}
                aria-label={`Выгружать столбец «${c.label}»`}
              />
              <span className="text-sm text-brand">{c.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Выбрано столбцов: {selected.length} из {cols.length}</span>
          <span className="flex gap-2">
            <button
              type="button"
              className="text-azure-dark hover:underline"
              onClick={() => setSelected(cols.map((c) => c.key))}
            >
              Выбрать все
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="text-azure-dark hover:underline"
              onClick={() => setSelected([])}
            >
              Снять все
            </button>
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => onExport(orderedSelected)}
            disabled={selected.length === 0 || exporting}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Download className="h-4 w-4" strokeWidth={2} />
            )}
            Скачать Excel ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Диалог импорта: drop-зона, парсинг на клиенте, превью, шаблон, результат */
function DictImportDialog({
  kind,
  onClose,
  onImported,
}: {
  kind: DictKind;
  onClose: () => void;
  onImported: () => void;
}) {
  const cfg = DICT_CONFIG[kind];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMutation = useMutation({
    mutationFn: () =>
      api.post<ImportResult>("/api/app/import", {
        kind,
        rows: (rows ?? []).map(cfg.toApiRow),
      }),
    onSuccess: (res) => {
      setResult(res);
      onImported();
      toast.success(
        `Импорт завершен: создано ${res.created}, пропущено ${res.skipped}` +
          (res.errors.length ? `, ошибок ${res.errors.length}` : "")
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function reset() {
    setFileName(null);
    setRows(null);
    setParseError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Парсинг файла на клиенте: первая строка — заголовки (trim+lowercase),
   * русские заголовки экспорта приводятся к техническим ключам (HEADER_ALIASES)
   */
  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("В файле нет листов с данными");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      if (matrix.length < 2) {
        throw new Error("Файл не содержит строк данных (нужны заголовки и минимум одна строка)");
      }
      const aliases = HEADER_ALIASES[kind];
      const headers = (matrix[0] as unknown[]).map((h) => {
        const raw = String(h ?? "").trim().toLowerCase();
        return aliases[raw] ?? raw;
      });
      const missing = cfg.required.filter((c) => !headers.includes(c));
      if (missing.length > 0) {
        setRows(null);
        setFileName(file.name);
        setParseError(
          `Отсутствуют обязательные колонки: ${missing.join(", ")}. Скачайте шаблон и заполните его по образцу.`
        );
        return;
      }
      const parsed: ParsedRow[] = (matrix.slice(1) as unknown[][])
        .map((line) => {
          const obj: ParsedRow = {};
          headers.forEach((h, i) => {
            if (h) obj[h] = String(line[i] ?? "").trim();
          });
          return obj;
        })
        .filter((r) => Object.values(r).some((v) => v !== ""));
      if (parsed.length === 0) throw new Error("Все строки файла пустые");
      setFileName(file.name);
      setRows(parsed);
    } catch (e) {
      setRows(null);
      setFileName(file.name);
      setParseError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    }
  }

  /** Шаблон xlsx: заголовки + 2 примера строк */
  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet(cfg.templateAoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
    XLSX.writeFile(wb, cfg.templateFile);
    toast.success(`Шаблон ${cfg.templateFile} скачан`);
  }

  const preview = rows?.slice(0, PREVIEW_COUNT) ?? [];
  const restCount = Math.max(0, (rows?.length ?? 0) - PREVIEW_COUNT);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-brand">Импорт — {cfg.title}</DialogTitle>
          <DialogDescription>
            Загрузите файл Excel/CSV: первая строка — заголовки колонок (русские названия из
            экспорта или ключи шаблона). Отсутствующие города, статусы и ЛПУ создаются
            автоматически, повторные записи пропускаются как дубли. Каждая операция фиксируется
            в журнале аудита.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Зона загрузки */}
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky/50 bg-sky-light/40",
              "px-6 py-8 text-center cursor-pointer transition-colors hover:border-azure hover:bg-sky-light/70"
            )}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white">
              <Upload className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold text-brand">Выберите файл Excel или CSV</span>
            <span className="text-xs text-muted-foreground max-w-md">
              Поддерживаются .xlsx, .xls, .csv. {cfg.hint}
              {fileName && <span className="block mt-1 text-azure font-medium">{fileName}</span>}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              aria-label="Файл импорта"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {/* Ошибка валидации колонок / парсинга */}
          {parseError && (
            <div className="flex items-start gap-2 rounded-xl border border-azure/40 bg-sky-light/60 p-4 text-sm text-brand-dark">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Превью строк */}
          {rows && rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-brand">
                <FileSpreadsheet className="h-4 w-4 text-azure" strokeWidth={2} />
                <span className="font-medium">Распознано строк: {rows.length}</span>
                <span className="text-xs text-muted-foreground">— проверьте превью перед импортом</span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/60">
                      {cfg.previewCols.map((c) => (
                        <TableHead key={c.key} className="text-xs">{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {cfg.previewCols.map((c) => (
                          <TableCell key={c.key} className="text-sm max-w-44 truncate" title={r[c.key] || ""}>
                            {r[c.key] || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {restCount > 0 && <p className="text-xs text-muted-foreground">и ещё {restCount}…</p>}
            </div>
          )}

          {/* Результат импорта */}
          {result && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                  Создано: {result.created}
                </Badge>
                <Badge variant="outline" className="bg-sky-light text-brand border-transparent">
                  Пропущено (дубли): {result.skipped}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    result.errors.length > 0
                      ? "bg-sky-light text-azure-dark border-azure/40"
                      : "bg-muted text-muted-foreground border-transparent"
                  )}
                >
                  Ошибок: {result.errors.length}
                </Badge>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-azure/40 bg-sky-light/60 p-3 text-xs text-brand-dark space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between sm:items-center gap-2">
          <Button
            variant="ghost"
            onClick={downloadTemplate}
            className="gap-1.5 text-brand hover:bg-sky-light"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Скачать шаблон
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Закрыть</Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!rows?.length || importMutation.isPending}
              className="gap-1.5"
            >
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={2} />
              )}
              Импортировать{rows?.length ? ` ${rows.length} строк` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

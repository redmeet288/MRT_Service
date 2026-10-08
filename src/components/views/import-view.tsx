"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { ImportResult } from "@/lib/types";
import { SectionCard, EmptyState } from "@/components/shared/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Building2,
  Stethoscope,
  AlertTriangle,
  Info,
  Loader2,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "lpus" | "doctors";
type ParsedRow = Record<string, string>;

const PREVIEW_COUNT = 8;

/** Описание формата колонок для подсказки */
const COLUMN_HINTS: Record<Kind, { col: string; required: boolean; desc: string }[]> = {
  lpus: [
    { col: "name", required: true, desc: "Название ЛПУ" },
    { col: "city", required: true, desc: "Город (создается автоматически, если его нет)" },
    { col: "address", required: false, desc: "Адрес (улица, дом)" },
  ],
  doctors: [
    { col: "fullName", required: true, desc: "ФИО врача" },
    { col: "phone", required: false, desc: "Телефон" },
    { col: "birthDate", required: false, desc: "Дата рождения (ДД.ММ.ГГГГ)" },
    { col: "status", required: false, desc: "Статус сотрудничества (ИП, СЗ… — создается автоматически, если его нет)" },
    { col: "city", required: false, desc: "Город (создается автоматически, если его нет)" },
    { col: "mpLogin", required: true, desc: "Логин курирующего МП (должен существовать в системе)" },
    { col: "lpus", required: false, desc: "Названия ЛПУ через «;» (создаются в городе врача, если не найдены)" },
  ],
};

const REQUIRED_COLS: Record<Kind, string[]> = {
  lpus: ["name", "city"],
  doctors: ["fullname", "mplogin"],
};

const DISPLAY_COLS: Record<Kind, { key: string; label: string }[]> = {
  lpus: [
    { key: "name", label: "Название" },
    { key: "city", label: "Город" },
    { key: "address", label: "Адрес" },
  ],
  doctors: [
    { key: "fullname", label: "ФИО" },
    { key: "phone", label: "Телефон" },
    { key: "birthdate", label: "Дата рождения" },
    { key: "status", label: "Статус" },
    { key: "city", label: "Город" },
    { key: "mplogin", label: "Логин МП" },
    { key: "lpus", label: "ЛПУ" },
  ],
};

/** Маппинг нормализованных ключей в формат API */
function toApiRow(kind: Kind, r: ParsedRow): Record<string, string> {
  if (kind === "lpus") {
    return { name: r.name ?? "", city: r.city ?? "", address: r.address ?? "" };
  }
  return {
    fullName: r.fullname ?? "",
    phone: r.phone ?? "",
    birthDate: r.birthdate ?? "",
    status: r.status ?? "",
    city: r.city ?? "",
    mpLogin: r.mplogin ?? "",
    lpus: r.lpus ?? "",
  };
}

export function ImportView() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky/40 bg-sky-light/50 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 shrink-0 text-azure mt-0.5" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-brand">Массовый импорт начальной базы</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Загрузите файл Excel/CSV по шаблону: первая строка — заголовки колонок. Города, статусы и
            отсутствующие ЛПУ создаются автоматически. Повторные записи пропускаются как дубли, каждая
            операция фиксируется в журнале аудита.
          </p>
        </div>
      </div>

      <Tabs defaultValue="lpus" className="space-y-4">
        <TabsList className="bg-white border border-border h-11 p-1 rounded-lg">
          <TabsTrigger value="lpus" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
            <Building2 className="h-4 w-4" strokeWidth={2} /> ЛПУ
          </TabsTrigger>
          <TabsTrigger value="doctors" className="gap-2 px-4 data-[state=active]:bg-sky-light data-[state=active]:text-brand">
            <Stethoscope className="h-4 w-4" strokeWidth={2} /> Врачи (НВ)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lpus"><ImportPane kind="lpus" /></TabsContent>
        <TabsContent value="doctors"><ImportPane kind="doctors" /></TabsContent>
      </Tabs>
    </div>
  );
}

function ImportPane({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFileName(null);
    setRows(null);
    setParseError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Парсинг файла на клиенте: первая строка — заголовки, далее строки данных */
  async function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("В файле нет листов с данными");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      if (matrix.length < 2) throw new Error("Файл не содержит строк данных (нужны заголовки и минимум одна строка)");
      const headers = (matrix[0] as unknown[]).map((h) => String(h ?? "").trim().toLowerCase());
      const missing = REQUIRED_COLS[kind].filter((c) => !headers.includes(c));
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
            obj[h] = String(line[i] ?? "").trim();
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

  const importMutation = useMutation({
    mutationFn: () =>
      api.post<ImportResult>("/api/app/import", {
        kind,
        rows: (rows ?? []).map((r) => toApiRow(kind, r)),
      }),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Импорт завершен: создано ${res.created}, пропущено ${res.skipped}`);
      // Обновляем все зависимые данные (справочники, НВ, дашборд)
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Генерация и скачивание xlsx-шаблона на клиенте */
  function downloadTemplate() {
    const aoa: string[][] =
      kind === "lpus"
        ? [
            ["name", "city", "address"],
            ["ГКБ № 5", "Москва", "ул. Строителей, 4"],
            ["Поликлиника № 2", "Казань", "ул. Баумана, 10"],
          ]
        : [
            ["fullName", "phone", "birthDate", "status", "city", "mpLogin", "lpus"],
            ["Иванов Алексей Борисович", "+7 900 000-00-00", "12.05.1980", "ИП", "Москва", "m.ivanova", "ГКБ № 5;Поликлиника № 2"],
            ["Петрова Вера Геннадьевна", "+7 900 111-11-11", "01.09.1975", "СЗ", "Казань", "a.petrova", "ГКБ № 5"],
          ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
    XLSX.writeFile(wb, kind === "lpus" ? "shablon-lpu.xlsx" : "shablon-nv.xlsx");
  }

  const cols = DISPLAY_COLS[kind];
  const preview = rows?.slice(0, PREVIEW_COUNT) ?? [];
  const restCount = Math.max(0, (rows?.length ?? 0) - PREVIEW_COUNT);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <SectionCard
        title={kind === "lpus" ? "Импорт ЛПУ" : "Импорт врачей (НВ)"}
        description={kind === "lpus" ? "Файл с колонками name, city, address" : "Файл с колонками fullName, phone, birthDate, status, city, mpLogin, lpus"}
        className="xl:col-span-2"
        action={
          <Button variant="outline" onClick={downloadTemplate} className="gap-1.5 border-sky/50 text-brand hover:bg-sky-light">
            <Download className="h-4 w-4" strokeWidth={2} /> Скачать шаблон
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Зона загрузки */}
          <label
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky/50 bg-sky-light/40",
              "px-6 py-10 text-center cursor-pointer transition-colors hover:border-azure hover:bg-sky-light/70"
            )}
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <Upload className="h-5 w-5 text-azure" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold text-brand">Выберите файл Excel или CSV</span>
            <span className="text-xs text-muted-foreground max-w-sm">
              Поддерживаются .xlsx, .xls, .csv. Первая строка файла — заголовки колонок.
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
            <div className="flex items-start gap-2 rounded-xl border border-terra/50 bg-terra-light p-4 text-sm text-terra-dark">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Превью строк */}
          {rows && rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-brand">
                <FileSpreadsheet className="h-4 w-4 text-azure" strokeWidth={2} />
                <span className="font-medium">Распознано строк: {rows.length}</span>
                <span className="text-xs text-muted-foreground">— проверьте превью перед импортом</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/60">
                      {cols.map((c) => (
                        <TableHead key={c.key} className="text-xs">{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {cols.map((c) => (
                          <TableCell key={c.key} className="text-sm max-w-48 truncate" title={r[c.key] || ""}>
                            {r[c.key] || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {restCount > 0 && (
                <p className="text-xs text-muted-foreground">и ещё {restCount}…</p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                  className="gap-1.5"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <Upload className="h-4 w-4" strokeWidth={2} />
                  )}
                  Импортировать {rows.length} строк
                </Button>
                <Button variant="ghost" onClick={reset} className="text-muted-foreground">
                  Сбросить
                </Button>
              </div>
            </div>
          )}

          {/* Результат импорта */}
          {result && (
            <div className="space-y-3 rounded-xl border border-border bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                <CheckCircle2 className="h-4 w-4 text-azure" strokeWidth={2} />
                Импорт завершен
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-brand text-white hover:bg-brand">Создано: {result.created}</Badge>
                <Badge className="bg-sky text-white hover:bg-sky">Пропущено (дубли): {result.skipped}</Badge>
                {result.errors.length > 0 && (
                  <Badge className="bg-terra-dark text-white hover:bg-terra-dark">
                    Ошибок: {result.errors.length}
                  </Badge>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-terra/50 bg-terra-light p-3">
                  <p className="text-xs font-semibold text-terra-dark mb-1.5">Подробности ошибок:</p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-terra-dark">• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {rows && rows.length === 0 && (
            <EmptyState title="Строки не распознаны" hint="Проверьте, что данные начинаются со второй строки файла" />
          )}
        </div>
      </SectionCard>

      {/* Подсказка по формату */}
      <SectionCard title="Формат колонок" description="Заголовки указываются латиницей в первой строке файла">
        <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {COLUMN_HINTS[kind].map((h) => (
            <li key={h.col} className="rounded-lg border border-border bg-white p-3">
              <div className="flex items-center gap-2">
                <code className="text-xs font-bold text-azure bg-sky-light rounded px-1.5 py-0.5">{h.col}</code>
                {h.required && (
                  <Badge variant="outline" className="text-[10px] border-terra/60 text-terra-dark">
                    обязательно
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{h.desc}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-soft border border-border p-3">
          <ClipboardList className="h-4 w-4 shrink-0 text-sky mt-0.5" strokeWidth={2} />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Дубликаты определяются по названию: ЛПУ — связка «название + город», врачи — по ФИО.
            Пропущенные строки не блокируют импорт остальных.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

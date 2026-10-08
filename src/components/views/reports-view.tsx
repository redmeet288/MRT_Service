"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api, qs } from "@/lib/api-client";
import type {
  CityData,
  DoctorItem,
  NomenclatureItem,
  ReportPreset,
  ReportRequestRow,
  ReportResponse,
  UserBasic,
} from "@/lib/types";
import {
  DeleteButton,
  EmptyState,
  RowsSkeleton,
  fmtDate,
  fmtDateTime,
} from "@/components/shared/ui-bits";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronRight,
  Coins,
  FileDown,
  FileSpreadsheet,
  Save,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   Транслитерация для PDF (jsPDF стандартно не поддерживает
   кириллицу) — простая карта а-я → a-ya
   ============================================================ */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function translit(value: string): string {
  return (value ?? "")
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const t = TRANSLIT[lower];
      if (t === undefined) return ch; // латиница, цифры, пунктуация — как есть
      if (t === "") return "";
      if (ch !== lower) return t.charAt(0).toUpperCase() + t.slice(1);
      return t;
    })
    .join("");
}

/* ============================================================ */

const pct = (done: number, total: number) =>
  total > 0 ? Math.round((done / total) * 100) : 0;

function pctBadgeClass(p: number): string {
  if (p >= 66) return "bg-azure/15 text-azure-dark";
  if (p >= 33) return "bg-sky-light text-brand";
  return "bg-terra-light text-terra-dark";
}

function toggleSet(
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  id: string
) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

interface FlatRow {
  mp: string;
  lpu: string;
  city: string;
  doctor: string;
  date: string;
  patient: string;
  destination: string;
  assigned: string;
  done: string;
}

export function ReportsView() {
  const qc = useQueryClient();

  // —— Фильтры ("" = без фильтра) ——
  const [from, setFrom] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [mpId, setMpId] = useState("");
  const [lpuId, setLpuId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [assignedId, setAssignedId] = useState("");
  const [doneFilter, setDoneFilter] = useState(""); // "" | "1" | "0"

  // —— Раскрытые группы дерева (контролируемый аккордеон на state) ——
  const [openMp, setOpenMp] = useState<Set<string>>(new Set());
  const [openLpu, setOpenLpu] = useState<Set<string>>(new Set());
  const [openDoc, setOpenDoc] = useState<Set<string>>(new Set());

  // —— Пресеты ——
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

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
    () => (doctors ?? []).filter((d) => !mpId || d.mpId === mpId),
    [doctors, mpId]
  );

  const { data: nomenclature } = useQuery<NomenclatureItem[]>({
    queryKey: ["nomenclature-active"],
    queryFn: () => api.get("/api/app/nomenclature?active=1"),
  });

  const { data: presets } = useQuery<ReportPreset[]>({
    queryKey: ["presets"],
    queryFn: () => api.get("/api/app/presets"),
  });

  // —— Отчет ——
  const reportQuery = useQuery<ReportResponse>({
    queryKey: ["report-examinations", from, to, mpId, lpuId, doctorId, assignedId, doneFilter],
    queryFn: () =>
      api.get<ReportResponse>(
        `/api/app/reports/examinations${qs({
          from,
          to: `${to}T23:59:59`,
          mpId,
          lpuId,
          doctorId,
          assignedId,
          done: doneFilter === "" ? undefined : doneFilter,
        })}`
      ),
    enabled: Boolean(from && to),
  });
  const data = reportQuery.data;

  const doneTotal = useMemo(
    () => (data?.tree ?? []).reduce((s, m) => s + m.done, 0),
    [data]
  );
  const total = data?.total ?? 0;

  // —— Плоские строки для экспорта ——
  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    (data?.tree ?? []).forEach((mp) =>
      mp.lpus.forEach((lpu) =>
        lpu.doctors.forEach((doc) =>
          doc.requests.forEach((r) =>
            rows.push({
              mp: mp.name,
              lpu: lpu.name,
              city: lpu.city,
              doctor: doc.name,
              date: fmtDate(r.date),
              patient: r.patientName,
              destination: r.destination ?? "—",
              assigned: r.assigned ?? "—",
              done: r.done ?? "Не выполнено",
            })
          )
        )
      )
    );
    return rows;
  }, [data]);

  // —— Аудит экспорта (ТЗ п.8) — фиксация до формирования файла ——
  async function logExport(kind: string) {
    try {
      await api.post("/api/app/audit", {
        action: "EXPORT",
        entity: "report",
        details: `Экспорт отчета «По обследованиям»: ${flatRows.length} строк, период ${from}–${to}, формат ${kind}`,
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

    if (kind === "Excel") {
      const ws = XLSX.utils.json_to_sheet(
        flatRows.map((r) => ({
          "МП": r.mp,
          "ЛПУ": r.lpu,
          "Город": r.city,
          "НВ": r.doctor,
          "Дата": r.date,
          "Пациент": r.patient,
          "Куда": r.destination,
          "Назначено": r.assigned,
          "Сделано": r.done,
        }))
      );
      ws["!cols"] = [
        { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 28 },
        { wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Отчет");
      XLSX.writeFile(wb, "otchet-po-obsledovaniyam.xlsx");
    } else {
      const doc = new jsPDF({ orientation: "landscape" });
      autoTable(doc, {
        head: [["MP", "LPU", "Gorod", "NV", "Data", "Pacient", "Kuda", "Naznacheno", "Sdelano"]],
        body: flatRows.map((r) => [
          translit(r.mp),
          translit(r.lpu),
          translit(r.city),
          translit(r.doctor),
          r.date,
          translit(r.patient),
          translit(r.destination),
          translit(r.assigned),
          translit(r.done),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [25, 70, 136], textColor: 255 },
        alternateRowStyles: { fillColor: [227, 234, 248] },
      });
      doc.save("otchet-po-obsledovaniyam.pdf");
    }
    toast.success(`Экспорт ${kind} выполнен: ${flatRows.length} строк`);
  }

  // —— Мутации пресетов ——
  const savePreset = useMutation({
    mutationFn: () =>
      api.post("/api/app/presets", {
        name: presetName.trim(),
        reportKey: "examinations",
        filters: { from, to, mpId, lpuId, doctorId, assignedId, done: doneFilter },
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

  function applyPreset(p: ReportPreset) {
    try {
      const f = JSON.parse(p.filtersJson) as Partial<{
        from: string;
        to: string;
        mpId: string;
        lpuId: string;
        doctorId: string;
        assignedId: string;
        done: string;
      }>;
      setFrom(f.from ?? "");
      setTo(f.to ?? "");
      setMpId(f.mpId ?? "");
      setLpuId(f.lpuId ?? "");
      setDoctorId(f.doctorId ?? "");
      setAssignedId(f.assignedId ?? "");
      setDoneFilter(f.done ?? "");
      setPresetsOpen(false);
      toast.success(`Пресет «${p.name}» применен`);
    } catch {
      toast.error("Не удалось применить пресет");
    }
  }

  return (
    <div className="space-y-6">
      {/* —— Параметры отчета —— */}
      <section className="rounded-xl border border-border bg-white p-6 shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
        <div className="mb-4">
          <h3 className="font-display text-base font-bold text-brand">Параметры отчета</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Базовый отчет «По обследованиям» · иерархия МП → ЛПУ → НВ → детализация заявок
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Период с</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Период по</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Медицинский представитель</Label>
            <Select value={mpId || "ALL"} onValueChange={(v) => setMpId(v === "ALL" ? "" : v)}>
              <SelectTrigger className="bg-white">
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
            <Select value={lpuId || "ALL"} onValueChange={(v) => setLpuId(v === "ALL" ? "" : v)}>
              <SelectTrigger className="bg-white">
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
              value={doctorId || "ALL"}
              onValueChange={(v) => setDoctorId(v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Все НВ" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL">Все НВ</SelectItem>
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
              value={assignedId || "ALL"}
              onValueChange={(v) => setAssignedId(v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="bg-white">
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
              value={doneFilter || "ALL"}
              onValueChange={(v) => setDoneFilter(v === "ALL" ? "" : v)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Все</SelectItem>
                <SelectItem value="1">Только выполненные</SelectItem>
                <SelectItem value="0">Только невыполненные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Пресеты фильтров */}
          <div className="flex items-end gap-2">
            <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-1.5 border-sky/40 text-brand hover:bg-sky-light"
                >
                  <Bookmark className="h-4 w-4" strokeWidth={2} />
                  Пресеты{presets?.length ? ` · ${presets.length}` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                {!presets?.length ? (
                  <p className="p-2 text-xs text-muted-foreground">
                    Пресетов пока нет — настройте фильтры и сохраните их.
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
            <Button
              variant="ghost"
              className="gap-1.5 text-azure hover:text-azure-dark"
              onClick={() => setSaveOpen(true)}
            >
              <Save className="h-4 w-4" strokeWidth={2} />
              Сохранить фильтры
            </Button>
          </div>
        </div>
      </section>

      {/* —— Отчет —— */}
      <section className="rounded-xl border border-border bg-white p-6 shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-brand">
              Отчет по обследованиям
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data
                ? `Сформирован: ${fmtDateTime(data.generatedAt)}`
                : "Задайте период и фильтры"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Задел этапа 2: колонка «Начисленный бонус» (недоступна на старте) */}
            <div
              className="flex items-center gap-2.5 rounded-lg border border-border bg-soft px-3 py-2 opacity-75"
              title="Функционал этапа 2 — бонусная система"
            >
              <Coins className="h-4 w-4 text-sky/70" strokeWidth={2} />
              <div>
                <p className="text-[11px] font-medium leading-tight text-muted-foreground">
                  Колонка «Начисленный бонус»
                </p>
                <p className="text-[10px] leading-tight text-muted-foreground/70">
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
            <Button
              variant="outline"
              onClick={() => doExport("Excel")}
              disabled={!flatRows.length}
              className="gap-1.5 border-sky/40 text-brand hover:bg-sky-light"
            >
              <FileSpreadsheet className="h-4 w-4 text-azure" strokeWidth={2} /> Excel
            </Button>
            <Button
              onClick={() => doExport("PDF")}
              disabled={!flatRows.length}
              className="gap-1.5"
            >
              <FileDown className="h-4 w-4" strokeWidth={2} /> PDF
            </Button>
          </div>
        </div>

        {/* Верхний итог */}
        <div className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg bg-soft px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Всего заявок
            </p>
            <p className="font-display text-2xl font-bold text-brand">{total}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Выполнено
            </p>
            <p className="font-display text-2xl font-bold text-azure-dark">{doneTotal}</p>
          </div>
          <Badge className={cn("font-display text-sm", pctBadgeClass(pct(doneTotal, total)))}>
            {pct(doneTotal, total)}% выполнения
          </Badge>
          {reportQuery.isFetching && (
            <span className="text-xs text-muted-foreground">Обновление…</span>
          )}
        </div>

        {reportQuery.error ? (
          <div className="rounded-xl border border-terra/50 bg-terra-light p-6 text-sm text-brand-dark">
            Не удалось построить отчет: {(reportQuery.error as Error).message}
          </div>
        ) : reportQuery.isLoading || !data ? (
          <RowsSkeleton rows={6} />
        ) : data.tree.length === 0 ? (
          <EmptyState
            title="Нет заявок за выбранный период"
            hint="Измените фильтры или расширьте период — данные появятся здесь"
          />
        ) : (
          <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {data.tree.map((mp) => (
              <div key={mp.id} className="overflow-hidden rounded-xl border border-border">
                {/* Уровень 1: МП */}
                <GroupRow
                  icon={UserRound}
                  label={mp.name}
                  total={mp.total}
                  done={mp.done}
                  depth={0}
                  open={openMp.has(mp.id)}
                  onToggle={() => toggleSet(setOpenMp, mp.id)}
                />
                {openMp.has(mp.id) &&
                  (mp.lpus.length === 0 ? (
                    <div className="border-t border-border/60 bg-soft/40 px-4">
                      <EmptyState title="У МП нет заявок по фильтрам" className="py-5" />
                    </div>
                  ) : (
                    <div className="space-y-2 border-t border-border/60 bg-soft/40 p-2">
                      {mp.lpus.map((lpu) => (
                        <div
                          key={lpu.id}
                          className="overflow-hidden rounded-lg border border-border/70 bg-white"
                        >
                          {/* Уровень 2: ЛПУ */}
                          <GroupRow
                            icon={Building2}
                            label={lpu.name}
                            hint={lpu.city}
                            total={lpu.total}
                            done={lpu.done}
                            depth={1}
                            open={openLpu.has(lpu.id)}
                            onToggle={() => toggleSet(setOpenLpu, lpu.id)}
                          />
                          {openLpu.has(lpu.id) &&
                            (lpu.doctors.length === 0 ? (
                              <div className="border-t border-border/60 px-4">
                                <EmptyState title="Нет заявок по этому ЛПУ" className="py-4" />
                              </div>
                            ) : (
                              <div className="border-t border-border/60">
                                {lpu.doctors.map((doc) => (
                                  <div key={doc.id}>
                                    {/* Уровень 3: НВ */}
                                    <GroupRow
                                      icon={Stethoscope}
                                      label={doc.name}
                                      total={doc.total}
                                      done={doc.done}
                                      depth={2}
                                      open={openDoc.has(doc.id)}
                                      onToggle={() => toggleSet(setOpenDoc, doc.id)}
                                    />
                                    {/* Уровень 4: детализация заявок */}
                                    {openDoc.has(doc.id) && <RequestsTable rows={doc.requests} />}
                                  </div>
                                ))}
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* —— Диалог сохранения пресета —— */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-brand">
              Сохранить пресет фильтров
            </DialogTitle>
            <DialogDescription>
              Пресет доступен только вам в списке «Пресеты».
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
              Сохраняются: период, МП, ЛПУ, НВ, назначение, выполненность.
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

/* ============ Строка-заголовок группы дерева ============ */
function GroupRow({
  icon: Icon,
  label,
  hint,
  total,
  done,
  depth,
  open,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
  total: number;
  done: number;
  depth: 0 | 1 | 2;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2.5 py-2.5 pr-4 text-left transition-colors hover:bg-sky-light/70",
        depth === 0 && "bg-sky-light/50 px-4",
        depth === 1 && "bg-white pl-6",
        depth === 2 && "bg-white pl-10"
      )}
    >
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-sky transition-transform duration-200",
          open && "rotate-90"
        )}
        strokeWidth={2}
      />
      <span
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          depth === 0 ? "bg-white text-brand" : "bg-sky-light text-brand"
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span
        className={cn(
          "truncate text-brand",
          depth === 0 ? "font-display text-sm font-bold" : "text-sm font-medium"
        )}
      >
        {label}
      </span>
      {hint && <span className="truncate text-xs text-muted-foreground">· {hint}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Заявок: <span className="font-display font-bold text-brand">{total}</span>
        </span>
        <span className="hidden text-muted-foreground sm:inline">
          Выполнено: <span className="font-display font-bold text-azure-dark">{done}</span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-display text-[10px] font-semibold",
            pctBadgeClass(pct(done, total))
          )}
        >
          {pct(done, total)}%
        </span>
      </span>
    </button>
  );
}

/* ============ Вложенная таблица заявок (детализация) ============ */
function RequestsTable({ rows }: { rows: ReportRequestRow[] }) {
  return (
    <div className="bg-white px-2 pb-2">
      <div className="max-h-96 overflow-y-auto rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow className="bg-soft hover:bg-soft">
              <TableHead className="h-8 text-[11px]">Дата</TableHead>
              <TableHead className="h-8 text-[11px]">ФИО пациента</TableHead>
              <TableHead className="h-8 text-[11px]">Куда</TableHead>
              <TableHead className="h-8 text-[11px]">Назначено</TableHead>
              <TableHead className="h-8 text-[11px]">Сделано</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap py-1.5 text-xs">
                  {fmtDate(r.date)}
                </TableCell>
                <TableCell className="py-1.5 text-xs font-medium text-brand">
                  {r.patientName}
                </TableCell>
                <TableCell className="py-1.5 text-xs">{r.destination ?? "—"}</TableCell>
                <TableCell className="py-1.5 text-xs">{r.assigned ?? "—"}</TableCell>
                <TableCell className="py-1.5 text-xs">
                  {r.done ? (
                    <span className="inline-flex items-center gap-1 text-azure-dark">
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                      {r.done}
                    </span>
                  ) : (
                    <span className="text-terra-dark">Не выполнено</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

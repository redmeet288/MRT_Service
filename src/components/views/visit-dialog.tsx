"use client";

// ============================================================
// Общий диалог визита (создание / редактирование / удаление).
// Используется из «Календаря» (месяц/неделя/день) и раздела «Визиты».
// Дата уходит на сервер полным ISO: new Date(`${date}T${time}`).toISOString()
// Сервер (parseDate) принимает полный ISO и хранит время визита.
// ============================================================

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api-client";
import type { DoctorItem, LpuWithCity, Role, VisitItem } from "@/lib/types";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import { DeleteButton } from "@/components/shared/ui-bits";
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
import { CalendarPlus } from "lucide-react";

type VisitStatus = VisitItem["status"];

export interface VisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Режим редактирования — визит с данными; null/undefined — создание */
  visit?: VisitItem | null;
  /** Предзаполненная дата (клик по дню календаря) */
  defaultDate?: Date;
  /** Предзаполненное время HH:mm (клик по слоту часа в виде «День») */
  defaultTime?: string;
  /** Колбэк после успешного сохранения/удаления */
  onSaved?: () => void;
}

interface VisitForm {
  doctorId: string;
  lpuId: string; // "none" — ЛПУ не указан
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  purpose: string;
  comment: string;
  status: VisitStatus;
}

/**
 * Инициализатор формы — выполняется при монтировании диалога.
 * Диалоги монтируются условно (правило react-hooks/set-state-in-effect),
 * поэтому вся начальная форма вычисляется здесь, а не в useEffect.
 * При редактировании visit.date (ISO) разбирается на дату и время.
 */
function initForm(
  visit?: VisitItem | null,
  defaultDate?: Date,
  defaultTime?: string
): VisitForm {
  if (visit) {
    const d = new Date(visit.date);
    return {
      doctorId: visit.doctorId,
      lpuId: visit.lpuId ?? "none",
      date: format(d, "yyyy-MM-dd"),
      time: format(d, "HH:mm"),
      purpose: visit.purpose,
      comment: visit.comment ?? "",
      status: visit.status,
    };
  }
  return {
    doctorId: "",
    lpuId: "none",
    date: format(defaultDate ?? new Date(), "yyyy-MM-dd"),
    time: defaultTime ?? "09:00",
    purpose: "",
    comment: "",
    status: "PLANNED",
  };
}

export function VisitDialog({
  open,
  onOpenChange,
  visit = null,
  defaultDate,
  defaultTime,
  onSaved,
}: VisitDialogProps) {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isMP = (session?.user as { role?: Role } | undefined)?.role === "MP";
  const editing = visit ?? null;

  const [form, setForm] = useState<VisitForm>(() =>
    initForm(visit, defaultDate, defaultTime)
  );

  // —— Справочник НВ (кеш переиспользуется с календарем и разделом «Визиты») ——
  const { data: doctors } = useQuery<DoctorItem[]>({
    queryKey: ["doctors"],
    queryFn: () => api.get("/api/app/doctors"),
  });

  // Варианты НВ: активные; врач редактируемого визита показывается, даже если помечен на удаление
  const doctorOptions = useMemo<Array<Pick<DoctorItem, "id" | "fullName">>>(() => {
    const list = (doctors ?? [])
      .filter((d) => d.isActive)
      .map((d) => ({ id: d.id, fullName: d.fullName }));
    const cur = editing?.doctor;
    if (cur && !list.some((d) => d.id === cur.id)) {
      list.unshift({ id: cur.id, fullName: cur.fullName });
    }
    return list;
  }, [doctors, editing]);

  // —— Опции ЛПУ из привязок выбранного врача ——
  const selectedDoctor = (doctors ?? []).find((d) => d.id === form.doctorId);
  const lpuOptions = useMemo(() => {
    const opts: LpuWithCity[] = (selectedDoctor?.lpus ?? [])
      .map((x) => x.lpu)
      .filter((l) => l.isActive !== false);
    const editLpu = editing?.lpu ?? null;
    if (editLpu && !opts.some((o) => o.id === editLpu.id)) {
      opts.unshift(editLpu);
    }
    return opts;
  }, [selectedDoctor, editing]);

  const close = () => onOpenChange(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["visits"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["doctors"] }); // счетчики визитов в карточках НВ
  };

  // —— Сохранение: дата + время → локальная Date → полный ISO ——
  const save = useMutation({
    mutationFn: () => {
      const isoDate = new Date(
        `${form.date}T${form.time || "09:00"}`
      ).toISOString();
      const body = {
        doctorId: form.doctorId,
        lpuId: form.lpuId === "none" ? null : form.lpuId,
        date: isoDate,
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
      invalidate();
      onSaved?.();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // —— Удаление — только МП (сервер страхует через requireMP) ——
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/app/visits/${id}`),
    onSuccess: () => {
      toast.success("Визит удален");
      invalidate();
      onSaved?.();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] overflow-y-auto sm:max-w-lg">
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
                {doctorOptions.map((d) => (
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
          {/* Дата / Время / Статус */}
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
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
              <Label>
                Время{" "}
                <span className="text-[10px] font-normal text-muted-foreground">
                  (ЧЧ:ММ)
                </span>
              </Label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="bg-white"
                title="Время визита, например 09:30"
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
            <Button variant="outline" onClick={close}>
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
  );
}

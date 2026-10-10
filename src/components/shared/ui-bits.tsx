"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Inbox, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { VISIT_STATUS_LABELS } from "@/lib/types";

/** Карточка-секция вьюхи (модульная сетка гайдлайна) */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div>
          <CardTitle className="font-display text-base text-brand">{title}</CardTitle>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

/** Пустое состояние */
export function EmptyState({
  title = "Пока нет данных",
  hint,
  className,
}: {
  title?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 text-center", className)}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-light mb-3">
        <Inbox className="h-5 w-5 text-sky" strokeWidth={2} />
      </span>
      <p className="text-sm font-medium text-brand">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

/** Кнопка удаления с подтверждением (для роли МП) */
export function DeleteButton({
  onConfirm,
  title = "Удалить запись?",
  description = "Действие будет зафиксировано в журнале аудита.",
  disabled,
}: {
  onConfirm: () => Promise<void> | void;
  title?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-terra-dark hover:text-white hover:bg-terra"
          disabled={disabled || loading}
          aria-label="Удалить"
          title="Удалить"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-brand">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            className="bg-terra-dark text-white hover:bg-terra"
            onClick={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                await onConfirm();
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Удалить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Скелетон строк */
export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

/** Статус визита — фирменные цвета гайдлайна (лазурь/синий/терракот) */
export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    PLANNED: {
      label: VISIT_STATUS_LABELS.PLANNED,
      className: "bg-azure/10 text-azure-dark border-azure/30",
      icon: <Clock className="h-3 w-3" strokeWidth={2} />,
    },
    CONDUCTED: {
      label: VISIT_STATUS_LABELS.CONDUCTED,
      className: "bg-brand/10 text-brand border-brand/25",
      icon: <CheckCircle2 className="h-3 w-3" strokeWidth={2} />,
    },
    CANCELLED: {
      label: VISIT_STATUS_LABELS.CANCELLED,
      className: "bg-terra-light text-terra-dark border-terra/50",
      icon: <XCircle className="h-3 w-3" strokeWidth={2} />,
    },
  };
  const s = map[status] ?? map.PLANNED;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        s.className
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

/** Форматирование даты: 05.03.2026 */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Форматирование даты и времени */
export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ============================================================
   Сортировка таблиц (доработка 1.2): клик по заголовку столбца —
   сортировка по возрастанию, повторный — по убыванию, третий — сброс.
   ============================================================ */

export interface SortState {
  field: string;
  dir: "asc" | "desc";
}

/** Цикл сортировки: нет → asc → desc → нет */
export function cycleSort(
  current: SortState | null,
  field: string
): SortState | null {
  if (!current || current.field !== field) return { field, dir: "asc" };
  if (current.dir === "asc") return { field, dir: "desc" };
  return null;
}

/** Сортировка массива по одному полю; null/"" — всегда в конце */
export function applySort<T>(
  rows: T[],
  sort: SortState | null,
  getter: (row: T, field: string) => string | number | null | undefined
): T[] {
  if (!sort) return rows;
  const { field, dir } = sort;
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getter(a, field);
    const vb = getter(b, field);
    const emptyA = va === null || va === undefined || va === "";
    const emptyB = vb === null || vb === undefined || vb === "";
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1; // пустые — в конец независимо от направления
    if (emptyB) return -1;
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * mul;
    }
    return String(va).localeCompare(String(vb), "ru", { numeric: true }) * mul;
  });
}

/**
 * Кнопка сортировки для заголовка столбца (используется внутри <th>); самостоятельный
 * вариант для shadcn-таблиц — <TableHead><SortButton … /></TableHead>.
 */
export function SortButton({
  label,
  field,
  sort,
  onSort,
  ariaLabel,
}: {
  label: React.ReactNode;
  field: string;
  sort: SortState | null;
  onSort: (field: string) => void;
  ariaLabel?: string;
}) {
  const active = sort?.field === field;
  const dir = active ? sort.dir : null;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className="onec-sort-btn"
      data-active={active}
      onClick={() => onSort(field)}
      aria-label={ariaLabel ?? `Сортировать по столбцу «${typeof label === "string" ? label : field}»`}
      title="Сортировать по столбцу"
    >
      {label}
      <Icon
        className="h-3 w-3 shrink-0"
        strokeWidth={2.5}
        style={{ opacity: active ? 1 : 0.4 }}
        aria-hidden
      />
    </button>
  );
}

/**
 * Сортируемый заголовок 1С-таблицы. Использование:
 * <SortableTh label="НВ" field="doctor" sort={sort} onSort={(f) => setSort(cycleSort(sort, f))} />
 */
export function SortableTh({
  label,
  field,
  sort,
  onSort,
  className,
  align = "left",
  ariaLabel,
}: {
  label: React.ReactNode;
  field: string;
  sort: SortState | null;
  onSort: (field: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
  ariaLabel?: string;
}) {
  const active = sort?.field === field;
  const dir = active ? sort.dir : null;
  return (
    <th
      className={className}
      style={{ textAlign: align }}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <SortButton label={label} field={field} sort={sort} onSort={onSort} ariaLabel={ariaLabel} />
    </th>
  );
}

"use client";

// ============================================================
// Раздел «Визиты» — список всех визитов в стиле 1С:Предприятие.
// GET /api/app/visits (без from/to — до 2000 записей), клиентская
// сортировка по дате/времени УБЫВАНИЕ (свежие сверху), фильтры по
// статусу и поиск по НВ. Клик по строке → карточка визита (VisitDialog).
// Поддержка drill-down из дашборда: дашборд вызывает
// setActiveView("visits", { openVisitId }) — диалог откроется, когда
// данные визита загрузятся; закрытие очищает стор.
// ============================================================

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { VisitItem } from "@/lib/types";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import {
  EmptyState,
  RowsSkeleton,
  StatusChip,
  fmtDateTime,
} from "@/components/shared/ui-bits";
import { VisitDialog } from "@/components/views/visit-dialog";
import { useUiStore } from "@/store/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarCheck, CalendarPlus, RotateCcw, Search } from "lucide-react";

export function VisitsView() {
  // —— Drill-down из дашборда: ID визита читается один раз при монтировании ——
  // (инициализатор useState вместо useEffect — правило react-hooks/set-state-in-effect)
  const [pendingVisitId] = useState(() => useUiStore.getState().openVisitId);
  const [drillClosed, setDrillClosed] = useState(false);

  // —— Данные: все визиты (до 2000) ——
  const visitsQuery = useQuery<VisitItem[]>({
    queryKey: ["visits", "all"],
    queryFn: () => api.get<VisitItem[]>("/api/app/visits"),
  });

  // —— Фильтры (sentinel "ALL" — Radix Select не допускает пустых value) ——
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // —— Сортировка по дате/времени убывание + клиентская фильтрация ——
  const visits = useMemo(() => {
    const all = [...(visitsQuery.data ?? [])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const s = search.trim().toLowerCase();
    return all.filter(
      (v) =>
        (statusFilter === "ALL" || v.status === statusFilter) &&
        (!s || (v.doctor?.fullName ?? "").toLowerCase().includes(s))
    );
  }, [visitsQuery.data, statusFilter, search]);

  // —— Диалоги (монтируются условно; состояние — в инициализаторах) ——
  // undefined = закрыт, null = режим создания, VisitItem = редактирование
  const [dialogVisit, setDialogVisit] = useState<VisitItem | null | undefined>(
    undefined
  );

  // Карточка drill-down рендерится, только когда данные визита загружены;
  // визит может не найтись (вне первых 2000 или удален) — тогда просто игнор.
  const drillVisit =
    pendingVisitId && !drillClosed
      ? ((visitsQuery.data ?? []).find((v) => v.id === pendingVisitId) ?? null)
      : null;

  const filtersActive = statusFilter !== "ALL" || search.trim() !== "";
  const resetFilters = () => {
    setStatusFilter("ALL");
    setSearch("");
  };

  return (
    <>
      <div className="onec-window">
        {/* —— Заголовок окна —— */}
        <div className="onec-titlebar">
          <CalendarCheck className="h-4 w-4 text-terra-dark" strokeWidth={2} />
          <span className="text-sm font-semibold text-[#1c1c1c]">Визиты</span>
          {!visitsQuery.isLoading && !visitsQuery.error && (
            <span className="text-xs text-[#7a7a7a]">
              ({(visitsQuery.data ?? []).length})
            </span>
          )}
        </div>

        {/* —— Панель инструментов —— */}
        <div className="onec-toolbar">
          <button
            type="button"
            className="onec-btn onec-btn-primary"
            onClick={() => setDialogVisit(null)}
          >
            <CalendarPlus className="h-3.5 w-3.5" strokeWidth={2} />
            Добавить визит
          </button>
          <div className="mx-2 h-5 w-px bg-[#d9d9d9]" aria-hidden />
          <label className="flex items-center gap-1.5 text-xs text-[#7a7a7a]">
            Статус:
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 w-44 bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Все статусы</SelectItem>
                {(
                  Object.entries(VISIT_STATUS_LABELS) as Array<
                    [VisitItem["status"], string]
                  >
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="relative ml-auto flex items-center">
            <Search
              className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[#9a9a9a]"
              strokeWidth={2}
              aria-hidden
            />
            <input
              type="search"
              className="onec-search w-56 pl-7"
              placeholder="Поиск по НВ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск по врачу (НВ)"
            />
          </div>
          {filtersActive && (
            <button type="button" className="onec-btn" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              Сбросить
            </button>
          )}
        </div>

        {/* —— Таблица визитов —— */}
        {visitsQuery.isLoading ? (
          <div className="p-4">
            <RowsSkeleton rows={8} />
          </div>
        ) : visitsQuery.error ? (
          <div className="p-6 text-sm text-terra-dark">
            Не удалось загрузить визиты: {(visitsQuery.error as Error).message}
          </div>
        ) : visits.length === 0 ? (
          <EmptyState
            title={filtersActive ? "Ничего не найдено по фильтрам" : "Визитов пока нет"}
            hint={
              filtersActive
                ? "Измените условия отбора или сбросьте фильтры"
                : "Нажмите «Добавить визит» или запланируйте визит из календаря"
            }
            className="py-12"
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="onec-table">
              <thead>
                <tr>
                  <th className="w-44">Дата и время</th>
                  <th className="w-64">Врач (НВ)</th>
                  <th className="w-56">ЛПУ</th>
                  <th>Цель визита</th>
                  <th className="w-40">Статус</th>
                  <th className="w-48">Мед. представитель</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr
                    key={v.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setDialogVisit(v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDialogVisit(v);
                      }
                    }}
                    title="Открыть карточку визита"
                  >
                    <td className="whitespace-nowrap font-medium">
                      {fmtDateTime(v.date)}
                    </td>
                    <td>{v.doctor?.fullName ?? "—"}</td>
                    <td>{v.lpu?.name ?? "—"}</td>
                    <td className="max-w-xs">
                      <span className="line-clamp-1" title={v.purpose}>
                        {v.purpose}
                      </span>
                    </td>
                    <td>
                      <StatusChip status={v.status} />
                    </td>
                    <td>{v.mp?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* —— Строка состояния (в духе 1С) —— */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d9d9d9] bg-[#f6f6f6] px-3 py-1.5 text-[11px] text-[#7a7a7a]">
          <span>
            Записей: {visits.length}
            {filtersActive && !visitsQuery.isLoading && !visitsQuery.error
              ? ` из ${(visitsQuery.data ?? []).length}`
              : ""}
          </span>
          <span>Сортировка: по дате и времени убывание</span>
        </div>
      </div>

      {/* —— Диалог: клик по строке / «Добавить визит» —— */}
      {dialogVisit !== undefined && (
        <VisitDialog
          open={dialogVisit !== undefined}
          onOpenChange={(o) => {
            if (!o) setDialogVisit(undefined);
          }}
          visit={dialogVisit}
        />
      )}

      {/* —— Диалог drill-down из дашборда (открывается после загрузки данных) —— */}
      {drillVisit && (
        <VisitDialog
          open={Boolean(drillVisit)}
          visit={drillVisit}
          onOpenChange={(o) => {
            if (!o) {
              setDrillClosed(true);
              useUiStore.getState().clearOpenVisitId();
            }
          }}
        />
      )}
    </>
  );
}

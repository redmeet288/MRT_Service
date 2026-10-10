"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type TooltipProps,
} from "recharts";
import { api, qs } from "@/lib/api-client";
import type { DashboardData, Role } from "@/lib/types";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import {
  SectionCard,
  EmptyState,
  StatusChip,
  fmtDateTime,
  RowsSkeleton,
} from "@/components/shared/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  Building2,
  FilePlus2,
  CalendarDays,
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  MousePointerClick,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Clock,
} from "lucide-react";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

type TopDoctorRow = DashboardData["topDoctors"][number];

/** Усечение ФИО для подписи оси X диаграммы */
function truncateName(name: string, max = 12): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Время визита ЧЧ:ММ (date приходит ISO с временем) */
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Тултип динамики заявок по неделям */
function WeeksTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-[0_4px_16px_rgba(25,70,136,0.14)]">
      <p className="font-semibold text-brand">Неделя {label}</p>
      <p className="mt-0.5 font-display text-sm font-bold text-azure-dark">
        Заявок: {payload[0]?.value ?? 0}
      </p>
    </div>
  );
}

/** Тултип рейтинга врачей — полное ФИО врача + МП */
function DoctorTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as TopDoctorRow | undefined;
  if (!row) return null;
  return (
    <div className="max-w-[230px] rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-[0_4px_16px_rgba(25,70,136,0.14)]">
      <p className="font-semibold text-brand">{row.name}</p>
      {row.mp && <p className="mt-0.5 text-[11px] text-muted-foreground">{row.mp}</p>}
      <p className="mt-1 font-display text-sm font-bold text-azure-dark">
        Заявок за 30 дней: {row.count}
      </p>
    </div>
  );
}

export function DashboardView() {
  const { data: session } = useSession();
  // Роль через типизированный cast (сессия next-auth не типизирует role)
  const isMP = (session?.user as { role?: Role } | undefined)?.role === "MP";

  const { dashboardScope, setDashboardScope, setActiveView } = useUiStore();

  const { data, isLoading, error, refetch, isRefetching } = useQuery<DashboardData>({
    // scope включен в query key — смена области перезапрашивает данные
    queryKey: ["dashboard", dashboardScope],
    queryFn: () => api.get<DashboardData>(`/api/app/dashboard${qs({ scope: dashboardScope })}`),
  });

  function handleScopeChange(value: string) {
    if (value === "all" || value === "mine") setDashboardScope(value);
  }

  if (error) {
    return (
      <div className="rounded-xl border border-terra/50 bg-terra-light p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-terra-dark" strokeWidth={2} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-brand-dark">Не удалось загрузить дашборд</p>
            <p className="mt-0.5 text-xs text-brand-dark/70">{error.message}</p>
            <Button
              size="sm"
              className="mt-3 bg-terra-dark text-white hover:bg-terra"
              onClick={() => void refetch()}
              disabled={isRefetching}
            >
              {isRefetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
              Повторить
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const weeks = data?.weeks ?? [];
  const topDoctors = data?.topDoctors ?? [];
  const upcomingVisits = data?.upcomingVisits ?? [];
  const topChartData = topDoctors.map((d) => ({ ...d, shortName: truncateName(d.name) }));
  return (
    <div className="space-y-6">
      {/* Переключатель области данных (только МП; заголовок страницы — в шапке каркаса) */}
      {isMP && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Область данных:</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={dashboardScope}
            onValueChange={handleScopeChange}
            aria-label="Область данных дашборда"
          >
            <ToggleGroupItem value="all" className="px-3 text-xs">
              Все НВ
            </ToggleGroupItem>
            <ToggleGroupItem value="mine" className="px-3 text-xs">
              Только мои
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* KPI — 4 компактных кликабельных показателя в один ряд */}
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2" role="group" aria-label="Ключевые показатели">
        {isLoading || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
          : (
              <>
                <KpiCard
                  icon={<Stethoscope className="h-5 w-5 text-azure" strokeWidth={2} aria-hidden="true" />}
                  label="Направляющие врачи (НВ)"
                  value={data.kpi.doctorsTotal}
                  hint="Перейти в справочник НВ"
                  ariaLabel={`Направляющие врачи: ${data.kpi.doctorsTotal}. Открыть справочник врачей`}
                  onOpen={() => setActiveView("doctors")}
                />
                <KpiCard
                  icon={<Building2 className="h-5 w-5 text-azure" strokeWidth={2} aria-hidden="true" />}
                  label="ЛПУ"
                  value={data.kpi.lpusTotal}
                  hint="Перейти в справочник ЛПУ"
                  ariaLabel={`Лечебно-профилактические учреждения: ${data.kpi.lpusTotal}. Открыть справочник ЛПУ`}
                  onOpen={() => setActiveView("dictionaries", { dictTab: "lpus" })}
                />
                <KpiCard
                  icon={<FilePlus2 className="h-5 w-5 text-azure" strokeWidth={2} aria-hidden="true" />}
                  label="Заявки за 30 дней"
                  value={data.kpi.requests30}
                  hint={`Выполнено: ${data.kpi.done30}`}
                  ariaLabel={`Заявки за 30 дней: ${data.kpi.requests30}, выполнено ${data.kpi.done30}. Открыть список заявок`}
                  onOpen={() => setActiveView("requests")}
                />
                <KpiCard
                  icon={<CalendarDays className="h-5 w-5 text-terra-dark" strokeWidth={2} aria-hidden="true" />}
                  label="Визиты за 7 дней"
                  value={data.kpi.visits7}
                  hint="Перейти в календарь визитов"
                  ariaLabel={`Визиты за 7 дней: ${data.kpi.visits7}. Открыть календарь визитов`}
                  onOpen={() => setActiveView("calendar")}
                />
              </>
            )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Динамика заявок — клик по столбцу открывает заявки периода (плашка соразмерна «Рейтингу врачей») */}
        <SectionCard
          title="Динамика заявок"
          description="Количество направлений по неделям (8 недель)"
          className="h-full"
          action={<TrendingUp className="h-4 w-4 text-sky" strokeWidth={2} aria-hidden="true" />}
        >
          {isLoading || !data ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : weeks.length === 0 ? (
            <EmptyState title="Нет данных по заявкам" />
          ) : (
            <div
              role="group"
              aria-label="Столбчатая диаграмма: количество заявок по неделям"
            >
              <ResponsiveContainer width="100%" height={256}>
                <BarChart
                  data={weeks}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="var(--color-sky-light)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--color-brand)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-sky-light)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--color-brand)" }}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(1,150,210,0.07)" }}
                    content={<WeeksTooltip />}
                  />
                  <Bar
                    dataKey="count"
                    name="Заявок"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    activeBar={{ fill: "var(--color-azure)" }}
                    onClick={(_datum, index) => {
                      const w = weeks[index];
                      if (w) setActiveView("requests", { requestsFilters: { from: w.from, to: w.to } });
                    }}
                  >
                    {weeks.map((w) => (
                      <Cell
                        key={w.label}
                        cursor="pointer"
                        fill={w.count > 0 ? "var(--color-sky)" : "var(--color-sky-light)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="h-3.5 w-3.5 text-azure" strokeWidth={2} aria-hidden="true" />
                Нажмите на столбец, чтобы открыть заявки периода
              </p>
            </div>
          )}
        </SectionCard>

        {/* Рейтинг врачей — вертикальные столбцы, плашка соразмерна «Динамике заявок»; клик открывает все заявки врача */}
        <SectionCard
          title="Рейтинг врачей"
          description="Больше всего заявок за последние 30 дней"
          className="h-full"
        >
          {isLoading || !data ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : topChartData.length === 0 ? (
            <EmptyState title="Нет заявок за период" />
          ) : (
            <div role="group" aria-label="Вертикальная столбчатая диаграмма: рейтинг врачей по числу заявок">
              <ResponsiveContainer width="100%" height={256}>
                <BarChart
                  data={topChartData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid vertical={false} stroke="var(--color-sky-light)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 9, fill: "var(--color-brand)" }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--color-sky-light)" }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--color-brand)" }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip cursor={{ fill: "rgba(1,150,210,0.07)" }} content={<DoctorTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Заявок"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    cursor="pointer"
                    activeBar={{ fill: "var(--color-azure-dark)" }}
                    onClick={(_datum, index) => {
                      const d = topChartData[index];
                      if (d) setActiveView("requests", { requestsFilters: { doctorId: d.id } });
                    }}
                  >
                    {topChartData.map((d) => (
                      <Cell key={d.id} cursor="pointer" fill="var(--color-azure)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="h-3.5 w-3.5 text-azure" strokeWidth={2} aria-hidden="true" />
                Нажмите на столбец, чтобы открыть все заявки врача
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Ближайшие визиты — заголовок-ссылка и кликабельные строки */}
      <Card className="rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <button
            type="button"
            onClick={() => setActiveView("visits")}
            aria-label="Ближайшие визиты — перейти к списку всех визитов"
            className="group/t -mx-1 cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
          >
            <span className="flex items-center gap-1.5 font-display text-base font-semibold text-brand transition-colors group-hover/t:text-azure-dark">
              Ближайшие визиты
              <ArrowRight
                className="h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover/t:translate-x-0 group-hover/t:opacity-100"
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              План на ±7 дней · нажмите на визит, чтобы открыть его карточку
            </span>
          </button>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading || !data ? (
            <RowsSkeleton rows={4} />
          ) : upcomingVisits.length === 0 ? (
            <EmptyState title="Визитов не запланировано" hint="Создайте событие в календаре визитов" />
          ) : (
            <ul className="grid max-h-96 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {upcomingVisits.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setActiveView("visits", { openVisitId: v.id })}
                    aria-label={`Визит к врачу ${v.doctor.fullName} на ${fmtDateTime(v.date)}, статус: ${
                      VISIT_STATUS_LABELS[v.status] ?? v.status
                    }. Открыть карточку визита`}
                    className="group/v flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border bg-white p-3 text-left transition-all hover:border-azure/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-white",
                        v.status === "CONDUCTED"
                          ? "bg-brand"
                          : v.status === "CANCELLED"
                            ? "bg-terra"
                            : "bg-azure"
                      )}
                    >
                      <span className="font-display text-base font-bold leading-none">
                        {new Date(v.date).getDate()}
                      </span>
                      <span className="mt-0.5 text-[9px] uppercase">
                        {new Date(v.date)
                          .toLocaleDateString("ru-RU", { month: "short" })
                          .replace(".", "")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand">{v.doctor.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.purpose}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusChip status={v.status} />
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 text-sky" strokeWidth={2} aria-hidden="true" />
                          {fmtTime(v.date)}
                        </span>
                        {v.lpu && (
                          <span className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                            {v.lpu.name}
                          </span>
                        )}
                        {v.mp && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            МП: {v.mp.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Компактная кликабельная KPI-карточка (переход в раздел) */
function KpiCard({
  icon,
  label,
  value,
  hint,
  ariaLabel,
  onOpen,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  ariaLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      className="group cursor-pointer rounded-xl border border-border bg-white p-4 text-left shadow-[0_2px_12px_rgba(25,70,136,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-azure/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-light transition-colors group-hover:bg-azure/15">
          {icon}
        </span>
        <ArrowUpRight
          className="h-4 w-4 text-azure opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
      <span className="mt-2 block font-display text-3xl font-bold leading-none text-brand tabular-nums">
        {value}
      </span>
      <span className="mt-1.5 block truncate text-xs font-semibold text-brand">{label}</span>
      {hint && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

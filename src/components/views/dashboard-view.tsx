"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardData } from "@/lib/types";
import { SectionCard, EmptyState, StatusChip } from "@/components/shared/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Stethoscope,
  Building2,
  FilePlus2,
  CalendarDays,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { VISIT_STATUS_LABELS } from "@/lib/types";
import { useUiStore } from "@/store/ui";
import { cn } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

export function DashboardView() {
  const { setActiveView } = useUiStore();
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/api/app/dashboard"),
  });

  if (error) {
    return (
      <div className="rounded-xl border border-terra/50 bg-terra-light p-6 text-sm text-brand-dark">
        Не удалось загрузить дашборд: {(error as Error).message}
      </div>
    );
  }

  const maxWeek = Math.max(1, ...(data?.weeks.map((w) => w.count) ?? [1]));

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              icon={<Stethoscope className="h-5 w-5 text-azure" strokeWidth={2} />}
              label="Направляющие врачи"
              value={data.kpi.doctorsTotal}
              hint="Активные НВ в базе"
            />
            <KpiCard
              icon={<Building2 className="h-5 w-5 text-azure" strokeWidth={2} />}
              label="ЛПУ"
              value={data.kpi.lpusTotal}
              hint="Учреждения в справочнике"
            />
            <KpiCard
              icon={<FilePlus2 className="h-5 w-5 text-azure" strokeWidth={2} />}
              label="Заявки за 30 дней"
              value={data.kpi.requests30}
              hint={`Выполнено: ${data.kpi.done30}`}
              accent
            />
            <KpiCard
              icon={<CalendarDays className="h-5 w-5 text-terra-dark" strokeWidth={2} />}
              label="Визиты на 7 дней"
              value={data.kpi.plannedVisits}
              hint="Запланированные встречи"
              warm
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Динамика заявок */}
        <SectionCard
          title="Динамика заявок"
          description="Количество направлений по неделям (8 недель)"
          className="xl:col-span-2"
          action={<TrendingUp className="h-4 w-4 text-sky" strokeWidth={2} />}
        >
          {isLoading || !data ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : (
            <div className="flex items-end gap-3 h-48">
              {data.weeks.map((w) => (
                <div key={w.label} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-xs font-semibold text-brand opacity-0 group-hover:opacity-100 transition-opacity font-display">
                    {w.count}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all",
                      w.count > 0 ? "bg-sky group-hover:bg-azure" : "bg-sky-light"
                    )}
                    style={{ height: `${Math.max(4, (w.count / maxWeek) * 120)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">{w.label}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Топ НВ */}
        <SectionCard title="Топ НВ по заявкам" description="За последние 30 дней">
          {isLoading || !data ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : data.topDoctors.length === 0 ? (
            <EmptyState title="Нет заявок за период" />
          ) : (
            <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {data.topDoctors.map((d, i) => (
                <li key={d.id} className="flex items-center gap-3">
                  <span className="font-display text-sm font-bold text-sky w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.mp}</p>
                  </div>
                  <Badge className="bg-sky-light text-brand hover:bg-sky-light">{d.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Ближайшие визиты */}
        <SectionCard
          title="Ближайшие визиты"
          description="План на ±7 дней"
          action={
            <button
              type="button"
              onClick={() => setActiveView("calendar")}
              className="text-xs font-medium text-azure hover:underline"
            >
              Открыть календарь →
            </button>
          }
        >
          {isLoading || !data ? (
            <Skeleton className="h-44 rounded-lg" />
          ) : data.upcomingVisits.length === 0 ? (
            <EmptyState title="Визитов не запланировано" hint="Создайте событие в календаре визитов" />
          ) : (
            <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {data.upcomingVisits.map((v) => (
                <li
                  key={v.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-white p-3"
                >
                  <div
                    className={cn(
                      "flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-white",
                      v.status === "CONDUCTED" ? "bg-brand" : v.status === "CANCELLED" ? "bg-terra" : "bg-azure"
                    )}
                  >
                    <span className="font-display text-base font-bold leading-none">
                      {new Date(v.date).getDate()}
                    </span>
                    <span className="text-[9px] uppercase mt-0.5">
                      {new Date(v.date).toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brand truncate">{v.doctor?.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.purpose}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusChip status={v.status} />
                      {v.lpu && <span className="text-[11px] text-muted-foreground truncate">{v.lpu.name}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Последние заявки */}
        <SectionCard
          title="Последние заявки"
          description="Недавно зарегистрированные направления"
          action={
            <button
              type="button"
              onClick={() => setActiveView("requests")}
              className="text-xs font-medium text-azure hover:underline"
            >
              Все заявки →
            </button>
          }
        >
          {isLoading || !data ? (
            <Skeleton className="h-44 rounded-lg" />
          ) : data.recentRequests.length === 0 ? (
            <EmptyState title="Заявок пока нет" />
          ) : (
            <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {data.recentRequests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand truncate">
                      {r.patientName} <span className="text-muted-foreground font-normal">· {r.doctor.fullName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.assigned?.name ?? "—"} · {r.lpu.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">{formatDate(r.date)}</div>
                    {r.done ? (
                      <CheckCircle2 className="h-4 w-4 text-azure inline-block mt-1" strokeWidth={2} />
                    ) : (
                      <Clock className="h-4 w-4 text-terra-dark inline-block mt-1" strokeWidth={2} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
  warm,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
  warm?: boolean;
}) {
  return (
    <Card
      className={cn(
        "rounded-xl border-border shadow-[0_2px_12px_rgba(25,70,136,0.05)]",
        accent && "border-azure/30",
        warm && "border-terra/40"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light">
            {icon}
          </span>
          <span className="font-display text-3xl font-bold text-brand">{value}</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-brand">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

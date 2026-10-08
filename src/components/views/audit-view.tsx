"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import type { AuditLogItem } from "@/lib/types";
import { SectionCard, EmptyState, RowsSkeleton, fmtDateTime } from "@/components/shared/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { History, Database, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

/** Фильтр «— все —» — служебное значение (пустая строка недопустима в Select) */
const ALL = "__all__";

const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: "doctor", label: "НВ (врачи)" },
  { value: "request", label: "Заявки" },
  { value: "visit", label: "Визиты" },
  { value: "lpu", label: "ЛПУ" },
  { value: "city", label: "Города" },
  { value: "nomenclature", label: "Номенклатура" },
  { value: "status", label: "Статусы" },
  { value: "user", label: "Пользователи" },
  { value: "report", label: "Отчеты" },
  { value: "preset", label: "Пресеты" },
];

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "CREATE", label: "Создание" },
  { value: "UPDATE", label: "Изменение" },
  { value: "DELETE", label: "Удаление" },
  { value: "EXPORT", label: "Экспорт" },
  { value: "IMPORT", label: "Импорт" },
];

/** Бейдж действия — фирменные цвета гайдлайна */
function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    CREATE: "bg-azure text-white",
    UPDATE: "bg-sky text-white",
    DELETE: "bg-terra text-white",
    EXPORT: "bg-brand text-white",
    IMPORT: "bg-terra-dark text-white",
  };
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-semibold", map[action] ?? "bg-muted text-muted-foreground")}
    >
      {action}
    </Badge>
  );
}

const ENTITY_LABELS: Record<string, string> = {
  doctor: "НВ",
  request: "Заявка",
  visit: "Визит",
  lpu: "ЛПУ",
  city: "Город",
  nomenclature: "Номенклатура",
  status: "Статус",
  user: "Пользователь",
  report: "Отчет",
  preset: "Пресет",
};

export function AuditView() {
  const { data: session } = useSession();
  const isMP = session?.user?.role === "MP";
  const [entity, setEntity] = useState(ALL);
  const [action, setAction] = useState(ALL);

  const { data: logs, isLoading } = useQuery<AuditLogItem[]>({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditLogItem[]>("/api/app/audit?limit=200"),
    enabled: isMP,
  });

  const filtered = useMemo(
    () =>
      (logs ?? []).filter(
        (l) => (entity === ALL || l.entity === entity) && (action === ALL || l.action === action)
      ),
    [logs, entity, action]
  );

  if (!isMP) {
    return (
      <EmptyState
        title="Доступно только МП"
        hint="Журнал действий доступен пользователям с ролью «МП · Администратор территории»."
        className="rounded-xl border border-dashed border-sky/50 bg-white/60"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky/40 bg-sky-light/50 p-4 flex items-start gap-3">
        <History className="h-5 w-5 shrink-0 text-azure mt-0.5" strokeWidth={2} />
        <p className="text-sm text-brand leading-relaxed">
          Журнал фиксирует изменения ключевых сущностей (НВ, Заявки), удаления и экспорты данных — с
          меткой времени и ID пользователя{" "}
          <span className="text-muted-foreground">(задел под синхронизацию с внешней CRM)</span>.
        </p>
      </div>

      <SectionCard
        title="Журнал действий"
        description={`Последние 200 событий · показано: ${filtered.length}`}
        action={<History className="h-4 w-4 text-sky" strokeWidth={2} />}
      >
        <div className="space-y-4">
          {/* Фильтры (на клиенте) */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Database className="h-3 w-3" strokeWidth={2} /> Сущность
              </Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger className="w-48 bg-white">
                  <SelectValue placeholder="Все сущности" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>— все</SelectItem>
                  {ENTITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" strokeWidth={2} /> Действие
              </Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-44 bg-white">
                  <SelectValue placeholder="Все действия" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>— все</SelectItem>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Таблица журнала */}
          {isLoading ? (
            <RowsSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={logs?.length ? "Нет событий по выбранным фильтрам" : "Журнал пока пуст"}
              hint={logs?.length ? "Измените фильтры сущности или действия" : "События появятся при работе с системой"}
            />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-36">Время</TableHead>
                    <TableHead className="w-44">Пользователь</TableHead>
                    <TableHead className="w-28">Действие</TableHead>
                    <TableHead className="w-32">Сущность</TableHead>
                    <TableHead>Детали</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(l.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-brand">
                        {l.userName ?? <span className="text-muted-foreground">Система</span>}
                      </TableCell>
                      <TableCell><ActionBadge action={l.action} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] border-sky/50 text-brand">
                          {ENTITY_LABELS[l.entity] ?? l.entity}
                          {l.entityId && (
                            <span
                              className="ml-1.5 text-[9px] text-muted-foreground font-mono"
                              title={`ID: ${l.entityId}`}
                            >
                              {l.entityId.slice(0, 8)}
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-80">
                        <span className="block truncate" title={l.details ?? undefined}>
                          {l.details ?? "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

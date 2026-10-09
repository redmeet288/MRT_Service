"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";
import { useUiStore, viewFromHash, OPERATOR_VIEWS, type ViewKey } from "@/store/ui";
import { LogoFull, LogoMark } from "@/components/logo";
import { ROLE_LABELS, type Role } from "@/lib/types";
import {
  LayoutDashboard,
  Stethoscope,
  FilePlus2,
  CalendarDays,
  CalendarCheck,
  BarChart3,
  LibraryBig,
  UsersRound,
  ScrollText,
  FileCode2,
  LogOut,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DashboardView,
  DoctorsView,
  RequestsView,
  CalendarView,
  VisitsView,
  ReportsView,
  DictionariesView,
  UsersView,
  AuditView,
  DocsView,
} from "@/components/views/registry";

const NAV: Array<{ section: string; items: Array<{ key: ViewKey; label: string; icon: React.ElementType; mpOnly?: boolean }> }> = [
  {
    section: "Рабочее место",
    items: [
      { key: "dashboard", label: "Дашборд", icon: LayoutDashboard, mpOnly: true },
      { key: "doctors", label: "Врачи (НВ)", icon: Stethoscope },
      { key: "requests", label: "Заявки", icon: FilePlus2 },
      { key: "visits", label: "Визиты", icon: CalendarCheck, mpOnly: true },
      { key: "calendar", label: "Календарь визитов", icon: CalendarDays, mpOnly: true },
    ],
  },
  {
    section: "Аналитика",
    items: [{ key: "reports", label: "Отчеты", icon: BarChart3, mpOnly: true }],
  },
  {
    section: "Управление",
    items: [
      { key: "dictionaries", label: "Справочники", icon: LibraryBig, mpOnly: true },
      { key: "users", label: "Пользователи", icon: UsersRound, mpOnly: true },
      { key: "audit", label: "Журнал действий", icon: ScrollText, mpOnly: true },
      { key: "docs", label: "Документация API", icon: FileCode2, mpOnly: true },
    ],
  },
];

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Дашборд", subtitle: "Ключевые показатели по территории" },
  doctors: { title: "Направляющие врачи (НВ)", subtitle: "Список врачей, привязки к ЛПУ и история взаимодействий" },
  requests: { title: "Заявки", subtitle: "Учет направлений на обследования" },
  visits: { title: "Визиты", subtitle: "Все визиты к НВ списком по дате и времени" },
  calendar: { title: "Календарь визитов", subtitle: "Планирование визитов к НВ" },
  reports: { title: "Отчеты", subtitle: "Отчет «По обследованиям» с вариантами группировки" },
  dictionaries: { title: "Справочники", subtitle: "Города, ЛПУ, номенклатура, статусы сотрудничества" },
  users: { title: "Пользователи", subtitle: "Учетные записи МП и операторов" },
  audit: { title: "Журнал действий", subtitle: "Аудит изменений ключевых сущностей и экспортов" },
  docs: { title: "Документация API", subtitle: "Структура БД, словарь данных, REST-эндпоинты" },
};

export function AppShell() {
  const { data: session } = useSession();
  const { activeView, setActiveView, syncFromHistory } = useUiStore();
  // Приведение типа сессии (аугментация next-auth отсутствует) — как в visit-dialog.tsx
  const role = (session?.user as { role?: Role } | undefined)?.role ?? "OPERATOR";
  const name = session?.user?.name ?? "";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isMP = role === "MP";
  const allowed: ViewKey[] = isMP
    ? ["dashboard", "doctors", "requests", "visits", "calendar", "reports", "dictionaries", "users", "audit", "docs"]
    : OPERATOR_VIEWS;

  // —— История браузера: кнопка «Назад» переключает разделы внутри приложения ——
  useEffect(() => {
    // Стартовый hash (если пользователь открыл ссылку на конкретный раздел)
    const initial = viewFromHash(window.location.hash);
    if (initial && allowed.includes(initial)) {
      syncFromHistory(initial);
    } else {
      window.history.replaceState({ view: activeView }, "", `#/${activeView}`);
    }
    const onPop = (e: PopStateEvent) => {
      const v = viewFromHash(window.location.hash);
      if (v && allowed.includes(v)) {
        syncFromHistory(v);
      } else {
        // Недоступный раздел (например, после смены роли) — домой
        const fallback: ViewKey = isMP ? "dashboard" : "requests";
        syncFromHistory(fallback);
        window.history.replaceState({ view: fallback }, "", `#/${fallback}`);
      }
      void e;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMP]);

  // —— Защита от ручного перехода оператора в закрытый раздел ——
  useEffect(() => {
    if (!allowed.includes(activeView)) {
      const fallback: ViewKey = isMP ? "dashboard" : "requests";
      setActiveView(fallback);
    }
  }, [activeView, isMP]);

  const meta = VIEW_TITLES[activeView] ?? VIEW_TITLES.dashboard;

  return (
    <div className="min-h-screen flex bg-soft">
      {/* —— Сайдбар —— */}
      <aside className="w-[68px] md:w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col sticky top-0 h-screen transition-[width] duration-200">
        <div className="px-5 pt-6 pb-5 flex justify-center md:justify-start">
          <span className="hidden md:block">
            <LogoFull markSize={38} variant="light" />
          </span>
          <span className="md:hidden">
            <LogoMark size={34} />
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Основная навигация">
          {NAV.map((group) => {
            const items = group.items.filter((it) => !it.mpOnly || isMP);
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-5">
                <div className="hidden md:block px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky/80 whitespace-nowrap">
                  {group.section}
                </div>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = activeView === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => setActiveView(item.key)}
                          aria-label={item.label}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "w-full flex items-center md:gap-3 gap-0 justify-center md:justify-start rounded-lg md:px-3 px-0 py-2.5 text-sm font-medium transition-colors relative",
                            active
                              ? "bg-sidebar-accent text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-azure" />
                          )}
                          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-azure" : "text-sky")} strokeWidth={2} />
                          <span className="hidden md:inline">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        {/* Мини-календарь текущего месяца (только МП) — быстрый переход к расписанию дня */}
        {isMP && <MiniCalendar />}
        {/* Паттерн в нижней части панели (гайдлайн: паттерны допустимы в боковых панелях) */}
        <div className="mrt-pattern h-24 opacity-70 pointer-events-none" />
        <div className="px-4 py-4 border-t border-sidebar-border flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-white/20">
            <AvatarFallback className="bg-azure text-white text-xs font-semibold">
              {initials || "—"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{name}</div>
            <div className="text-[11px] text-sky truncate">{ROLE_LABELS[role]}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            title="Выйти"
            aria-label="Выйти"
            className="p-2 rounded-lg text-sky hover:text-white hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </aside>

      {/* —— Контентная колонка —— */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-soft/85 backdrop-blur border-b border-border">
          <div className="px-8 py-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-brand">{meta.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{meta.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="hidden lg:inline-flex gap-1.5 bg-white text-brand border-sky/40 py-1.5"
              >
                <Building2 className="h-3.5 w-3.5 text-sky" strokeWidth={2} />
                Внутренний контур
              </Badge>
              <Badge
                className={cn(
                  "py-1.5 font-medium",
                  isMP ? "bg-brand text-white hover:bg-brand" : "bg-sky text-white hover:bg-sky"
                )}
              >
                {isMP ? "МП · Администратор территории" : "Оператор"}
              </Badge>
            </div>
          </div>
        </header>

        <main className="flex-1 px-8 py-6 view-enter" key={activeView}>
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "doctors" && <DoctorsView />}
          {activeView === "requests" && <RequestsView />}
          {activeView === "visits" && <VisitsView />}
          {activeView === "calendar" && <CalendarView />}
          {activeView === "reports" && <ReportsView />}
          {activeView === "dictionaries" && <DictionariesView />}
          {activeView === "users" && <UsersView />}
          {activeView === "audit" && <AuditView />}
          {activeView === "docs" && <DocsView />}
        </main>

        <footer className="mt-auto px-8 py-4 border-t border-border bg-white/60">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <LogoMark size={18} />
              <span className="font-medium text-brand">МРТ ТОЧНО</span> · CRM направляющих врачей · v1.1
            </span>
            <span>Внутренний сервер · Доступ по ролям · UUID-идентификаторы сущностей</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ============ Мини-календарь в сайдбаре (только МП) ============ */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MINI_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function MiniCalendar() {
  const setActiveView = useUiStore((s) => s.setActiveView);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weeks = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(now), { weekStartsOn: 1 }),
  });
  const openDay = (day: Date) =>
    setActiveView("calendar", { calendarDate: format(day, "yyyy-MM-dd") });
  return (
    <div className="hidden md:block px-4 pb-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="font-display text-xs font-semibold text-white">
          {cap(format(monthStart, "LLLL yyyy", { locale: ru }))}
        </span>
        <button
          type="button"
          onClick={() => openDay(new Date())}
          title="Перейти к сегодняшнему дню"
          aria-label="Открыть расписание на сегодня"
          className="rounded text-[11px] text-sky transition-colors hover:text-azure"
        >
          Сегодня
        </button>
      </div>
      <div className="grid grid-cols-7 justify-items-center">
        {MINI_WEEKDAYS.map((w) => (
          <div key={w} className="w-8 py-1 text-center text-[11px] text-sky">
            {w}
          </div>
        ))}
        {weeks.map((day) => {
          const today = isToday(day);
          const other = !isSameMonth(day, now);
          const label = `Открыть расписание на ${format(day, "d MMMM", { locale: ru })}`;
          return (
            <button
              key={format(day, "yyyy-MM-dd")}
              type="button"
              onClick={() => openDay(day)}
              title={label}
              aria-label={label}
              aria-current={today ? "date" : undefined}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-xs transition-colors",
                today
                  ? "bg-azure font-semibold text-white"
                  : cn(
                      "hover:bg-sidebar-accent",
                      other ? "text-sky/30 hover:text-sky" : "text-sidebar-foreground"
                    )
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

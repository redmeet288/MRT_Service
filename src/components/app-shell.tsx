"use client";

import { useEffect, useState } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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

/** Порядок главных вкладок нижней навигации на мобильном (остальные — в меню «Ещё») */
const MOBILE_MAIN_ORDER: ViewKey[] = ["dashboard", "requests", "calendar", "doctors"];

export function AppShell() {
  const { data: session } = useSession();
  const { activeView, setActiveView, syncFromHistory } = useUiStore();
  const [moreOpen, setMoreOpen] = useState(false);
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

  // —— Мобильная навигация: главные вкладки (порядок MOBILE_MAIN_ORDER) + «Ещё» ——
  const flatNav = NAV.flatMap((g) => g.items);
  const mainItems = MOBILE_MAIN_ORDER.filter((k) => allowed.includes(k)).map(
    (k) => flatNav.find((i) => i.key === k)!
  );
  const secondaryItems = flatNav.filter(
    (i) => (!i.mpOnly || isMP) && allowed.includes(i.key) && !MOBILE_MAIN_ORDER.includes(i.key)
  );

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
  const isSecondaryActive = secondaryItems.some((i) => i.key === activeView);

  return (
    <div className="min-h-screen flex bg-soft">
      {/* —— Сайдбар (только десктоп; на мобильном — нижний таб-бар) —— */}
      <aside className="hidden md:flex w-64 shrink-0 bg-sidebar text-sidebar-foreground flex-col sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-5 flex justify-start">
          <span>
            <LogoFull height={34} variant="light" />
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Основная навигация">
          {NAV.map((group) => {
            const items = group.items.filter((it) => !it.mpOnly || isMP);
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-5">
                <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky/80 whitespace-nowrap">
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
                            "w-full flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                            active
                              ? "bg-sidebar-accent text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-azure" />
                          )}
                          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-azure" : "text-sky")} strokeWidth={2} />
                          <span>{item.label}</span>
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
          <div className="flex-1 min-w-0">
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
      <div className="flex-1 min-w-0 flex flex-col min-h-screen pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Топ-бар мобильного приложения (тёмный, фирменный) */}
        <header className="md:hidden sticky top-0 z-30 bg-brand-deep text-white shadow-[0_2px_10px_rgba(11,36,80,0.25)]">
          <div className="h-14 px-3 flex items-center gap-2">
            <LogoMark size={28} variant="light" />
            <h1 className="flex-1 min-w-0 text-center font-display text-base font-bold truncate">
              {meta.title}
            </h1>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Выйти"
              aria-label="Выйти"
              className="p-2.5 rounded-lg text-sky hover:text-white hover:bg-white/10 transition-colors"
            >
              <LogOut className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Десктопный заголовок раздела */}
        <header className="hidden md:block sticky top-0 z-20 bg-soft/85 backdrop-blur border-b border-border">
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

        <main className="flex-1 px-3 py-4 md:px-8 md:py-6 view-enter" key={activeView}>
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

        <footer className="mt-auto px-3 md:px-8 py-3 md:py-4 border-t border-border bg-white/60">
          <div className="flex items-center justify-between gap-2 text-[10px] md:text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 min-w-0">
              <LogoMark size={16} />
              <span className="font-medium text-brand whitespace-nowrap">МРТ ТОЧНО</span>
              <span className="truncate">· CRM направляющих врачей · v1.5</span>
            </span>
            <span className="hidden md:inline">Внутренний сервер · Доступ по ролям · UUID-идентификаторы сущностей</span>
          </div>
        </footer>
      </div>

      {/* —— Нижняя навигация мобильного (большие тач-зоны, safe-area) —— */}
      <nav
        aria-label="Мобильная навигация"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 pb-[env(safe-area-inset-bottom)]"
      >
        <div
          className="h-14 items-stretch"
          style={{ display: "grid", gridTemplateColumns: `repeat(${mainItems.length + 1}, minmax(0,1fr))` }}
        >
          {mainItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 px-1 transition-colors",
                  active ? "text-azure" : "text-muted-foreground hover:text-brand"
                )}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-azure" aria-hidden />}
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                <span className={cn("text-[10px] leading-none", active && "font-semibold")}>
                  {item.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Ещё · открыть полное меню"
            aria-expanded={moreOpen}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 px-1 transition-colors",
              isSecondaryActive ? "text-azure" : "text-muted-foreground hover:text-brand"
            )}
          >
            {isSecondaryActive && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-azure" aria-hidden />}
            <MoreHorizontal className="h-5 w-5" strokeWidth={isSecondaryActive ? 2.4 : 2} />
            <span className={cn("text-[10px] leading-none", isSecondaryActive && "font-semibold")}>Ещё</span>
          </button>
        </div>
      </nav>

      {/* —— Меню «Ещё» (bottom-sheet) —— */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-0 pb-0 max-h-[85dvh] bg-white"
        >
          <SheetHeader className="px-4 pb-0 text-left">
            <SheetTitle className="font-display text-brand">Полное меню</SheetTitle>
            <SheetDescription className="sr-only">Все разделы системы и выход</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-2 py-2">
            {secondaryItems.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Дополнительных разделов для вашей роли нет
              </p>
            )}
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveView(item.key);
                    setMoreOpen(false);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 h-12 text-[15px] font-medium transition-colors",
                    active ? "bg-sky-light text-azure" : "text-brand hover:bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                  {item.label}
                  {active && <span className="ml-auto h-2 w-2 rounded-full bg-azure" aria-hidden />}
                </button>
              );
            })}
          </div>
          {/* Профиль и выход */}
          <div className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-sky/30">
              <AvatarFallback className="bg-azure text-white text-xs font-semibold">
                {initials || "—"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-brand truncate">{name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{ROLE_LABELS[role]}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5 border-terra/50 text-terra-dark hover:bg-terra-light hover:text-terra-dark"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <LogOut className="h-4 w-4" strokeWidth={2} /> Выйти
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ============ Мини-календарь в сайдбаре (только МП, десктоп) ============ */

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
    <div className="px-4 pb-3">
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

"use client";

import { useSession, signOut } from "next-auth/react";
import { useUiStore, type ViewKey } from "@/store/ui";
import { LogoFull, LogoMark } from "@/components/logo";
import { ROLE_LABELS } from "@/lib/types";
import {
  LayoutDashboard,
  Stethoscope,
  FilePlus2,
  CalendarDays,
  BarChart3,
  LibraryBig,
  Upload,
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
  ReportsView,
  DictionariesView,
  ImportView,
  UsersView,
  AuditView,
  DocsView,
} from "@/components/views/registry";

const NAV: Array<{ section: string; items: Array<{ key: ViewKey; label: string; icon: React.ElementType; mpOnly?: boolean }> }> = [
  {
    section: "Рабочее место",
    items: [
      { key: "dashboard", label: "Дашборд", icon: LayoutDashboard },
      { key: "doctors", label: "Врачи (НВ)", icon: Stethoscope },
      { key: "requests", label: "Заявки", icon: FilePlus2 },
      { key: "calendar", label: "Календарь визитов", icon: CalendarDays },
    ],
  },
  {
    section: "Аналитика",
    items: [{ key: "reports", label: "Отчеты", icon: BarChart3 }],
  },
  {
    section: "Управление",
    items: [
      { key: "dictionaries", label: "Справочники", icon: LibraryBig },
      { key: "import", label: "Импорт данных", icon: Upload },
      { key: "users", label: "Пользователи", icon: UsersRound, mpOnly: true },
      { key: "audit", label: "Журнал действий", icon: ScrollText, mpOnly: true },
      { key: "docs", label: "Документация API", icon: FileCode2 },
    ],
  },
];

const VIEW_TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Дашборд", subtitle: "Ключевые показатели по территории" },
  doctors: { title: "Направляющие врачи (НВ)", subtitle: "CRM-карточки, привязки к ЛПУ и история взаимодействий" },
  requests: { title: "Заявки", subtitle: "Учет направлений на обследования" },
  calendar: { title: "Календарь визитов", subtitle: "Планирование визитов к НВ" },
  reports: { title: "Отчеты", subtitle: "Конструктор отчетов с иерархической структурой" },
  dictionaries: { title: "Справочники", subtitle: "Города, ЛПУ, номенклатура, статусы сотрудничества" },
  import: { title: "Импорт данных", subtitle: "Массовая загрузка базы НВ и ЛПУ из Excel/CSV" },
  users: { title: "Пользователи", subtitle: "Учетные записи МП и операторов" },
  audit: { title: "Журнал действий", subtitle: "Аудит изменений ключевых сущностей и экспортов" },
  docs: { title: "Документация API", subtitle: "Структура БД, словарь данных, REST-эндпоинты" },
};

export function AppShell() {
  const { data: session } = useSession();
  const { activeView, setActiveView } = useUiStore();
  const role = session?.user?.role ?? "OPERATOR";
  const name = session?.user?.name ?? "";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const meta = VIEW_TITLES[activeView];

  return (
    <div className="min-h-screen flex bg-soft">
      {/* —— Сайдбар —— */}
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col sticky top-0 h-screen">
        <div className="px-5 pt-6 pb-5">
          <LogoFull markSize={38} variant="light" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Основная навигация">
          {NAV.map((group) => {
            const items = group.items.filter((it) => !it.mpOnly || role === "MP");
            if (!items.length) return null;
            return (
              <div key={group.section} className="mb-5">
                <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky/80">
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
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative",
                            active
                              ? "bg-sidebar-accent text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                          )}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-azure" />
                          )}
                          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-azure" : "text-sky")} strokeWidth={2} />
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
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
                  role === "MP" ? "bg-brand text-white hover:bg-brand" : "bg-sky text-white hover:bg-sky"
                )}
              >
                {role === "MP" ? "МП · Администратор территории" : "Оператор"}
              </Badge>
            </div>
          </div>
        </header>

        <main className="flex-1 px-8 py-6 view-enter" key={activeView}>
          {activeView === "dashboard" && <DashboardView />}
          {activeView === "doctors" && <DoctorsView />}
          {activeView === "requests" && <RequestsView />}
          {activeView === "calendar" && <CalendarView />}
          {activeView === "reports" && <ReportsView />}
          {activeView === "dictionaries" && <DictionariesView />}
          {activeView === "import" && <ImportView />}
          {activeView === "users" && <UsersView />}
          {activeView === "audit" && <AuditView />}
          {activeView === "docs" && <DocsView />}
        </main>

        <footer className="mt-auto px-8 py-4 border-t border-border bg-white/60">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <LogoMark size={18} />
              <span className="font-medium text-brand">МРТ ТОЧНО</span> · CRM направляющих врачей · v1.0
            </span>
            <span>Внутренний сервер · Доступ по ролям · UUID-идентификаторы сущностей</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

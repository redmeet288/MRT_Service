import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "doctors"
  | "requests"
  | "calendar"
  | "visits"
  | "reports"
  | "dictionaries"
  | "users"
  | "audit"
  | "docs";

/** Разделы, доступные оператору (остальные — только МП) */
export const OPERATOR_VIEWS: ViewKey[] = ["doctors", "requests"];

/** Фильтры, передаваемые в раздел «Заявки» при переходе с дашборда */
export interface RequestsNavFilters {
  from?: string; // ISO
  to?: string; // ISO
  mpId?: string;
  lpuId?: string;
  doctorId?: string;
  assignedId?: string;
  done?: "1" | "0";
}

/** Параметры перехода (drill-down) */
export interface NavPayload {
  requestsFilters?: RequestsNavFilters;
  dictTab?: "doctors" | "cities" | "lpus" | "nomenclature" | "statuses" | "specializations";
  openVisitId?: string | null;
  /** Дата для открытия календаря (мини-календарь сайдбара) */
  calendarDate?: string | null;
}

interface UiState {
  activeView: ViewKey;
  /** Фильтры для раздела «Заявки», установленные при переходе (одноразовые) */
  pendingRequestsFilters: RequestsNavFilters | null;
  /** Вкладка справочников, которую нужно открыть (одноразовая) */
  pendingDictTab: NavPayload["dictTab"] | null;
  /** ID визита, карточку которого нужно открыть (одноразовый) */
  openVisitId: string | null;
  /** Дата календаря, на которую нужно перейти (одноразовая, мини-календарь сайдбара) */
  pendingCalendarDate: string | null;
  /** Область дашборда: все НВ или только закрепленные (сохраняется локально) */
  dashboardScope: "all" | "mine";
  /** Переход на раздел с push в историю браузера (работает кнопка «Назад») */
  setActiveView: (v: ViewKey, payload?: NavPayload) => void;
  /** Синхронизация из истории браузера (popstate) — без push */
  syncFromHistory: (v: ViewKey) => void;
  consumeRequestsFilters: () => RequestsNavFilters | null;
  consumeDictTab: () => NavPayload["dictTab"];
  clearOpenVisitId: () => void;
  consumeCalendarDate: () => string | null;
  setDashboardScope: (s: "all" | "mine") => void;
}

const SCOPE_KEY = "mrt-dashboard-scope";

function readScope(): "all" | "mine" {
  if (typeof window === "undefined") return "all";
  return window.localStorage.getItem(SCOPE_KEY) === "mine" ? "mine" : "all";
}

export const useUiStore = create<UiState>((set, get) => ({
  activeView: "dashboard",
  pendingRequestsFilters: null,
  pendingDictTab: null,
  openVisitId: null,
  pendingCalendarDate: null,
  // Восстанавливаем сохраненный выбор области дашборда (localStorage)
  dashboardScope: readScope(),
  setActiveView: (v, payload) => {
    set({
      activeView: v,
      pendingRequestsFilters: payload?.requestsFilters ?? get().pendingRequestsFilters,
      pendingDictTab: payload?.dictTab ?? null,
      openVisitId: payload?.openVisitId ?? null,
      pendingCalendarDate: payload?.calendarDate ?? null,
    });
    // push в историю браузера → кнопка «Назад» работает внутри приложения
    if (typeof window !== "undefined" && window.location.hash !== `#/${v}`) {
      window.history.pushState({ view: v }, "", `#/${v}`);
    }
  },
  syncFromHistory: (v) => set({ activeView: v }),
  consumeRequestsFilters: () => {
    const f = get().pendingRequestsFilters;
    if (f) set({ pendingRequestsFilters: null });
    return f;
  },
  consumeDictTab: () => {
    const t = get().pendingDictTab;
    if (t) set({ pendingDictTab: null });
    return t ?? undefined;
  },
  clearOpenVisitId: () => set({ openVisitId: null }),
  consumeCalendarDate: () => {
    const d = get().pendingCalendarDate;
    if (d) set({ pendingCalendarDate: null });
    return d ?? null;
  },
  setDashboardScope: (s) => {
    set({ dashboardScope: s });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SCOPE_KEY, s);
    }
  },
}));

/** Разбор hash вида "#/doctors" → ViewKey */
export function viewFromHash(hash: string): ViewKey | null {
  const m = hash.replace(/^#\/?/, "");
  const valid: ViewKey[] = [
    "dashboard", "doctors", "requests", "calendar", "visits",
    "reports", "dictionaries", "users", "audit", "docs",
  ];
  return (valid as string[]).includes(m) ? (m as ViewKey) : null;
}

// ============================================================
// Общие типы «МРТ ТОЧНО» — соответствуют REST API /api/app/*
// ============================================================

export type Role = "MP" | "OPERATOR";

export interface SessionUser {
  uid: string;
  name: string;
  role: Role;
}

// —— Справочники ——
export interface City {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { lpus: number; doctors: number };
}

export interface CityData {
  id: string;
  name: string;
  city: City;
  address: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { doctors: number; requests: number };
}

export interface NomenclatureItem {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Справочник «Специализация врача» (доработка 1.2) */
export interface SpecializationItem {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { doctors: number };
}

export interface CooperationStatus {
  id: string;
  name: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { doctors: number };
}

// —— Пользователи (МП / Операторы) ——
export interface UserItem {
  id: string;
  login: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt?: string;
  _count?: { doctors: number };
}
export type UserBasic = Pick<UserItem, "id" | "name" | "role">;

// —— НВ (направляющий врач) ——
export interface DoctorItem {
  id: string;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  statusId: string | null;
  status: CooperationStatus | null;
  // МП может отсутствовать: оператор создает НВ только с ФИО, МП закрепит позже
  mpId: string | null;
  mp: { id: string; name: string } | null;
  cityId: string | null;
  city: City | null;
  comment: string | null;
  /** График работы НВ (доработка 1.2) — свободный текст */
  workSchedule: string | null;
  /** Специализации (доработка 1.2) — несколько позиций из справочника */
  specializations: { specialization: SpecializationItem }[];
  bonusType: "CASH" | "ACCUMULATIVE" | null;
  bonusBalance: number;
  payoutDetails: string | null;
  createdAt?: string;
  updatedAt?: string;
  lpus: { lpu: LpuWithCity }[];
  _count: { requests: number; visits: number };
}

export interface LpuWithCity {
  id: string;
  name: string;
  address: string | null;
  cityId: string;
  city: City;
}

export interface VisitItem {
  id: string;
  doctorId: string;
  doctor?: { id: string; fullName: string };
  lpuId: string | null;
  lpu?: LpuWithCity | null;
  mpId: string;
  mp?: { id: string; name: string };
  date: string;
  purpose: string;
  comment: string | null;
  status: "PLANNED" | "CONDUCTED" | "CANCELLED";
}

export interface RequestItem {
  id: string;
  date: string;
  patientName: string;
  doctorId: string;
  doctor: { id: string; fullName: string; mp: { id: string; name: string } };
  lpuId: string;
  lpu: LpuWithCity;
  destination: string | null;
  /** Что назначено — несколько позиций номенклатуры (доработка 1.2) */
  assignedItems: NomenclatureItem[];
  /** Что сделано — несколько позиций номенклатуры (доработка 1.2) */
  doneItems: NomenclatureItem[];
  authorId: string;
  author?: { id: string; name: string };
  bonusAmount?: number | null;
  comment: string | null;
}

// —— CRM-карточка НВ ——
export interface DoctorCard extends Omit<DoctorItem, "lpus" | "_count"> {
  lpus: { lpu: LpuWithCity }[];
  visits: VisitItem[];
  requests: RequestItem[];
}

// —— Отчет «По обследованиям» ——
export interface ReportRequestRow {
  id: string;
  date: string;
  patientName: string;
  destination: string | null;
  assigned: string | null;
  done: string | null;
  bonus: number | null;
  // Денормализованные поля (для вариантов группировки по ЛПУ / НВ / Номенклатуре)
  doctorName?: string;
  mpName?: string;
  lpuName?: string;
  cityName?: string;
}

/** Универсальный узел дерева отчета (variant=mp|lpu|doctor|nomenclature) */
export interface ReportGroupNode {
  level: "mp" | "lpu" | "doctor" | "nomenclature";
  id: string;
  name: string;
  subtitle: string;
  total: number;
  done: number;
  children: ReportGroupNode[];
  requests: ReportRequestRow[];
}
export interface ReportV2Response {
  generatedAt: string;
  total: number;
  variant: "mp" | "lpu" | "doctor" | "nomenclature";
  tree: ReportGroupNode[];
}

/** @deprecated старый формат МП→ЛПУ→НВ (совместимость) */
export interface ReportDoctorNode {
  id: string;
  name: string;
  total: number;
  done: number;
  requests: ReportRequestRow[];
}
export interface ReportLpuNode {
  id: string;
  name: string;
  city: string;
  total: number;
  done: number;
  doctors: ReportDoctorNode[];
}
export interface ReportMpNode {
  id: string;
  name: string;
  total: number;
  done: number;
  lpus: ReportLpuNode[];
}
export interface ReportResponse {
  generatedAt: string;
  total: number;
  tree: ReportMpNode[];
}

export interface ReportPreset {
  id: string;
  userId: string;
  name: string;
  reportKey: string;
  filtersJson: string;
  createdAt: string;
}

// —— Дашборд ——
export interface DashboardData {
  scope: "all" | "mine";
  kpi: {
    doctorsTotal: number;
    lpusTotal: number;
    requests30: number;
    done30: number;
    visits7: number;
    totalRequests: number;
  };
  weeks: Array<{ label: string; count: number; from: string; to: string }>;
  upcomingVisits: Array<VisitItem & { doctor: { id: string; fullName: string } }>;
  topDoctors: Array<{ id: string; name: string; mp: string; count: number }>;
}

// —— Аудит ——
export interface AuditLogItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

// —— Статусы визитов (общие константы) ——
export const VISIT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Запланирован",
  CONDUCTED: "Проведен",
  CANCELLED: "Отменен",
};

export const ROLE_LABELS: Record<Role, string> = {
  MP: "МП · Администратор территории",
  OPERATOR: "Пользователь · Оператор",
};

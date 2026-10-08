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
  mpId: string;
  mp: { id: string; name: string };
  cityId: string | null;
  city: City | null;
  comment: string | null;
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
  assignedId: string | null;
  assigned: NomenclatureItem | null;
  doneId: string | null;
  done: NomenclatureItem | null;
  authorId: string;
  author?: { id: string; name: string };
  bonusAmount?: number | null;
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
}
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
  kpi: {
    doctorsTotal: number;
    lpusTotal: number;
    requests30: number;
    done30: number;
    plannedVisits: number;
    totalRequests: number;
  };
  weeks: Array<{ label: string; count: number }>;
  upcomingVisits: Array<VisitItem & { doctor: { id: string; fullName: string } }>;
  recentRequests: RequestItem[];
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

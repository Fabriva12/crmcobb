export type PackageStatus = "en_camino" | "disponible" | "entregado";

export interface Client {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  instagram: string | null;
  whatsapp: string | null;
  notas: string | null;
  tarifa_lb: number;
  created_at: string;
  updated_at: string;
}

export interface Package {
  id: string;
  tracking_number: string;
  client_id: string | null;
  status: PackageStatus;
  peso_lb: number;
  tarifa_lb: number;
  total: number;
  /** Dólar vigente al momento de fijar el precio; null = seguir el global. */
  tipo_cambio: number | null;
  pagado: boolean | null;
  descripcion: string | null;
  notas: string | null;
  lista_id: string | null;
  fecha_recepcion: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageList {
  id: string;
  nombre: string;
  created_at: string;
}

export interface PackageWithClient extends Package {
  clients: Pick<Client, "id" | "nombre"> | null;
}

export interface PackageHistory {
  id: string;
  package_id: string;
  status: PackageStatus;
  note: string | null;
  created_at: string;
}

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  en_camino: "En camino",
  disponible: "Disponible",
  entregado: "Entregado",
};

export const PACKAGE_STATUS_ORDER: PackageStatus[] = [
  "en_camino",
  "disponible",
  "entregado",
];

export const DEFAULT_TARIFF_LB = 7.5;

export function relationSingle<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  cleanText,
  normalizeTracking,
  parseXlsx,
  toTitleCase,
} from "@/lib/import-xlsx";
import { normalizeSearch } from "@/lib/format";
import { getExchangeRate } from "@/lib/settings";
import { DEFAULT_TARIFF_LB } from "@/lib/types";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

export interface PreviewRow {
  tracking_number: string;
  contact: string;
  descripcion: string | null;
  fecha_recepcion: string | null;
  vuelo: string | null;
  suggestedName: string;
  clientId: string | null;
}

export interface PreviewResult {
  rows: PreviewRow[];
  clients: { id: string; nombre: string }[];
  emptyTracking: number;
  duplicates: number;
  error?: string;
}

export interface ConfirmRow {
  tracking_number: string;
  descripcion: string | null;
  fecha_recepcion: string | null;
  vuelo: string | null;
  clientId: string | null;
  clientName: string | null;
}

export interface ConfirmResult {
  inserted: number;
  skipped: number;
  clientsCreated: number;
  listaNombre: string | null;
  error?: string;
}

function normalizeTokens(name: string): string[] {
  return normalizeSearch(name)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function suggestClientId(
  contact: string,
  clients: { id: string; nombre: string }[]
): string | null {
  const nContact = normalizeSearch(contact);
  const contactTokens = normalizeTokens(contact);
  if (contactTokens.length === 0) return null;

  const exact = clients.find((c) => normalizeSearch(c.nombre) === nContact);
  if (exact) return exact.id;

  const contactSet = new Set(contactTokens);
  const sameTokens = clients.filter((c) => {
    const tokens = normalizeTokens(c.nombre);
    if (tokens.length !== contactTokens.length) return false;
    return tokens.every((t) => contactSet.has(t));
  });
  if (sameTokens.length === 1) return sameTokens[0].id;

  if (contactTokens.length >= 2) {
    const partial = clients.filter((c) => {
      const tokens = new Set(normalizeTokens(c.nombre));
      return contactTokens.every((t) => tokens.has(t));
    });
    if (partial.length === 1) return partial[0].id;
  }

  return null;
}

export async function previewImportAction(
  formData: FormData
): Promise<PreviewResult> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      rows: [],
      clients: [],
      emptyTracking: 0,
      duplicates: 0,
      error: "Seleccioná un archivo .xlsx para analizar.",
    };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return {
      rows: [],
      clients: [],
      emptyTracking: 0,
      duplicates: 0,
      error: "El archivo debe ser .xlsx.",
    };
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return {
      rows: [],
      clients: [],
      emptyTracking: 0,
      duplicates: 0,
      error: `El archivo está vacío o supera los ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    };
  }

  const buffer = await file.arrayBuffer();

  const supabase = await createClient();
  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, nombre")
    .order("nombre", { ascending: true });
  const clients = (clientsData ?? []) as { id: string; nombre: string }[];

  const parsed = parseXlsx(buffer);
  if (parsed.rows.length === 0) {
    return {
      rows: [],
      clients,
      emptyTracking: parsed.emptyTracking,
      duplicates: parsed.duplicates,
      error: "No se encontraron paquetes con número de seguimiento en el archivo.",
    };
  }

  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const matchedId = suggestClientId(r.contact, clients);
    return {
      tracking_number: r.tracking_number,
      contact: r.contact,
      descripcion: r.descripcion,
      fecha_recepcion: r.fecha_recepcion,
      vuelo: r.vuelo,
      suggestedName:
        matchedId === null
          ? toTitleCase(r.contact)
          : (clients.find((c) => c.id === matchedId)?.nombre ??
            toTitleCase(r.contact)),
      clientId: matchedId,
    };
  });

  return {
    rows,
    clients,
    emptyTracking: parsed.emptyTracking,
    duplicates: parsed.duplicates,
  };
}

function formatImportDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

interface SanitizedRow {
  tracking: string;
  descripcion: string | null;
  fecha_recepcion: string | null;
  vuelo: string | null;
  clientId: string | null;
  clientName: string | null;
}

function sanitizeRow(r: unknown): SanitizedRow | null {
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;

  const tracking = normalizeTracking(rec.tracking_number);
  if (!tracking || tracking.length > 120) return null;
  if (/[\u0000-\u001f\u007f]/.test(tracking)) return null;

  const descripcion =
    typeof rec.descripcion === "string"
      ? cleanText(rec.descripcion).slice(0, 500) || null
      : null;

  const fecha =
    typeof rec.fecha_recepcion === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(rec.fecha_recepcion)
      ? rec.fecha_recepcion
      : null;

  const vuelo =
    typeof rec.vuelo === "string" && rec.vuelo.trim()
      ? cleanText(rec.vuelo).slice(0, 120)
      : null;

  const clientIdRaw = typeof rec.clientId === "string" ? rec.clientId.trim() : "";
  const clientId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clientIdRaw
    )
      ? clientIdRaw
      : null;

  const clientName =
    typeof rec.clientName === "string" ? cleanText(rec.clientName).slice(0, 160) : "";

  return {
    tracking,
    descripcion,
    fecha_recepcion: fecha,
    vuelo,
    clientId,
    clientName: clientName || null,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function confirmImportAction(
  payload: ConfirmRow[]
): Promise<ConfirmResult> {
  await requireUser();

  if (!Array.isArray(payload) || payload.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      clientsCreated: 0,
      listaNombre: null,
      error: "No hay paquetes para importar.",
    };
  }
  if (payload.length > MAX_IMPORT_ROWS) {
    return {
      inserted: 0,
      skipped: 0,
      clientsCreated: 0,
      listaNombre: null,
      error: `El archivo supera el límite de ${MAX_IMPORT_ROWS} paquetes.`,
    };
  }

  const sanitized: SanitizedRow[] = [];
  for (const r of payload) {
    const clean = sanitizeRow(r);
    if (clean) sanitized.push(clean);
  }
  if (sanitized.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      clientsCreated: 0,
      listaNombre: null,
      error: "Los datos del archivo no son válidos.",
    };
  }

  const seen = new Set<string>();
  const unique: SanitizedRow[] = [];
  for (const r of sanitized) {
    if (seen.has(r.tracking)) continue;
    seen.add(r.tracking);
    unique.push(r);
  }
  const dupInPayload = sanitized.length - unique.length;

  const supabase = await createClient();

  const existing = new Set<string>();
  for (const part of chunk(
    unique.map((r) => r.tracking),
    500
  )) {
    const { data } = await supabase
      .from("packages")
      .select("tracking_number")
      .in("tracking_number", part);
    for (const p of data ?? []) existing.add(p.tracking_number);
  }
  const pending = unique.filter((r) => !existing.has(r.tracking));
  const skippedDb = unique.length - pending.length;

  if (pending.length === 0) {
    return {
      inserted: 0,
      skipped: skippedDb + dupInPayload,
      clientsCreated: 0,
      listaNombre: null,
      error: "Todos los paquetes del archivo ya estaban registrados.",
    };
  }

  const { data: allClients } = await supabase
    .from("clients")
    .select("id, nombre");
  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const c of allClients ?? []) {
    byName.set(normalizeSearch(String(c.nombre)), c.id);
    byId.set(c.id, String(c.nombre));
  }

  const createNeeded = new Map<string, string>();
  for (const r of pending) {
    if (r.clientId) continue;
    if (!r.clientName) continue;
    const key = normalizeSearch(r.clientName);
    if (byName.has(key)) continue;
    createNeeded.set(key, r.clientName);
  }

  let clientsCreated = 0;
  if (createNeeded.size > 0) {
    const { data: created, error } = await supabase
      .from("clients")
      .insert([...createNeeded.values()].map((n) => ({ nombre: toTitleCase(n) })))
      .select("id, nombre");
    if (error) {
      return {
        inserted: 0,
        skipped: 0,
        clientsCreated: 0,
        listaNombre: null,
        error: `No se pudieron crear los clientes: ${error.message}`,
      };
    }
    for (const c of created ?? []) {
      byName.set(normalizeSearch(String(c.nombre)), c.id);
      clientsCreated++;
    }
  }

  const clientByRow = new Map<string, string | null>();
  for (const r of pending) {
    if (r.clientId && byId.has(r.clientId)) {
      clientByRow.set(r.tracking, r.clientId);
      continue;
    }
    if (r.clientName) {
      const id = byName.get(normalizeSearch(r.clientName));
      clientByRow.set(r.tracking, id ?? null);
      continue;
    }
    clientByRow.set(r.tracking, null);
  }

  const listaNombre = formatImportDate(new Date());
  const { data: lista, error: listaError } = await supabase
    .from("package_lists")
    .insert({ nombre: listaNombre })
    .select("id, nombre")
    .single();
  if (listaError || !lista) {
    return {
      inserted: 0,
      skipped: 0,
      clientsCreated: 0,
      listaNombre: null,
      error: `No se pudo crear la lista: ${listaError?.message ?? "error de base"}`,
    };
  }

  const importRate = await getExchangeRate(supabase);
  const packageRows = pending.map((r) => ({
    tracking_number: r.tracking,
    client_id: clientByRow.get(r.tracking) ?? null,
    status: "en_camino",
    peso_lb: 0,
    tarifa_lb: DEFAULT_TARIFF_LB,
    tipo_cambio: importRate,
    pagado: false,
    descripcion: r.descripcion,
    notas: null,
    lista_id: lista.id,
    fecha_recepcion: r.fecha_recepcion,
    vuelo: r.vuelo,
  }));

  const { data: insertedData, error: insertError } = await supabase
    .from("packages")
    .upsert(packageRows, {
      onConflict: "tracking_number",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    return {
      inserted: 0,
      skipped: 0,
      clientsCreated,
      listaNombre: lista.nombre,
      error: `No se pudieron guardar los paquetes: ${insertError.message}`,
    };
  }

  const inserted = insertedData?.length ?? 0;
  const skipped = skippedDb + dupInPayload + (pending.length - inserted);

  if (insertedData && insertedData.length > 0) {
    await supabase.from("package_status_history").insert(
      insertedData.map((p) => ({
        package_id: p.id,
        status: "en_camino",
        note: null,
      }))
    );
  }

  revalidatePath("/");
  revalidatePath("/paquetes");
  revalidatePath("/paquetes/importar");

  return {
    inserted,
    skipped,
    clientsCreated,
    listaNombre: lista.nombre,
  };
}
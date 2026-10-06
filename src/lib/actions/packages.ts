"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { getExchangeRate } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_TARIFF_LB,
  PACKAGE_STATUS_ORDER,
  type PackageStatus,
} from "@/lib/types";

export type PackageFormState = { error?: string } | undefined;

function parseWeight(value: FormDataEntryValue | null): number {
  const numeric =
    value === null ? 0 : (() => {
        const parsed = typeof value === "string" ? Number(value) : null;
        return parsed === null || Number.isNaN(parsed) ? 0 : parsed;
      })();
  return numeric < 0 ? 0 : numeric;
}

function parseTariff(value: FormDataEntryValue | null, fallback: number): number {
  const numeric =
    value === null || String(value).trim() === ""
      ? null
      : (() => {
          const parsed = typeof value === "string" ? Number(value) : null;
          return parsed === null || Number.isNaN(parsed) ? null : parsed;
        })();
  if (numeric === null) return fallback;
  return numeric <= 0 ? fallback : numeric;
}

function parseStatus(value: FormDataEntryValue | null): PackageStatus | null {
  const status = String(value ?? "");
  return PACKAGE_STATUS_ORDER.includes(status as PackageStatus)
    ? (status as PackageStatus)
    : null;
}

function parsePagado(value: FormDataEntryValue | null): boolean | null {
  const raw = String(value ?? "");
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function parseDateField(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

async function insertHistory(
  packageId: string,
  status: PackageStatus,
  note: string | null
) {
  const supabase = await createClient();
  await supabase.from("package_status_history").insert({ package_id: packageId, status, note });
}

export async function createPackageAction(
  _prevState: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  await requireUser();
  const supabase = await createClient();

  const tracking_number = String(formData.get("tracking_number") ?? "").trim();
  if (!tracking_number) {
    return { error: "El número de seguimiento es obligatorio." };
  }

  const client_id = String(formData.get("client_id") ?? "") || null;
  const status = parseStatus(formData.get("status")) ?? "en_camino";
  const peso_lb = parseWeight(formData.get("peso_lb"));
  const tarifa_lb = parseTariff(
    formData.get("tarifa_lb"),
    DEFAULT_TARIFF_LB
  );
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const vueloValue = formData.get("vuelo");
  const vuelo = typeof vueloValue === "string" ? vueloValue.trim().slice(0, 120) || null : null;
  const fecha_recepcion = parseDateField(formData.get("fecha_recepcion"));

  const { data, error } = await supabase
    .from("packages")
    .insert({
      tracking_number,
      client_id,
      status,
      peso_lb,
      tarifa_lb,
      tipo_cambio: await getExchangeRate(supabase),
      descripcion,
      vuelo,
      fecha_recepcion,
      notas: String(formData.get("notas") ?? "").trim() || null,
      pagado: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un paquete con ese número de seguimiento." };
    }
    return { error: `No se pudo guardar el paquete: ${error.message}` };
  }

  await insertHistory(data.id, status, null);

  revalidatePath("/paquetes");
  revalidatePath("/");
  redirect("/paquetes");
}

export async function updatePackageAction(
  _prevState: PackageFormState,
  formData: FormData
): Promise<PackageFormState> {
  await requireUser();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");
  const tracking_number = String(formData.get("tracking_number") ?? "").trim();
  if (!id || !tracking_number) {
    return { error: "Datos incompletos." };
  }

  const client_id = String(formData.get("client_id") ?? "") || null;
  const status = parseStatus(formData.get("status")) ?? "en_camino";
  const peso_lb = parseWeight(formData.get("peso_lb"));
  const tarifa_lb = parseTariff(
    formData.get("tarifa_lb"),
    DEFAULT_TARIFF_LB
  );
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;
  const vueloValue = formData.get("vuelo");
  const vuelo = typeof vueloValue === "string" ? vueloValue.trim().slice(0, 120) || null : null;
  const fecha_recepcion = parseDateField(formData.get("fecha_recepcion"));

  const { data: current, error: fetchError } = await supabase
    .from("packages")
    .select("status, pagado, tarifa_lb, tipo_cambio")
    .eq("id", id)
    .single();
  if (fetchError || !current) {
    return { error: `No se pudo leer el paquete: ${fetchError?.message ?? "no encontrado"}` };
  }

  // El snapshot del dólar solo cambia si cambia la tarifa (el precio).
  const tipo_cambio =
    Number(current.tarifa_lb) !== tarifa_lb
      ? await getExchangeRate(supabase)
      : (current.tipo_cambio ?? null);

  const pagadoField = formData.get("pagado");
  const pagado =
    pagadoField !== null ? parsePagado(pagadoField) : current.pagado;

  const { error } = await supabase
    .from("packages")
    .update({
      tracking_number,
      client_id,
      status,
      peso_lb,
      tarifa_lb,
      tipo_cambio,
      descripcion,
      vuelo,
      fecha_recepcion,
      notas,
      pagado,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe otro paquete con ese número de seguimiento." };
    }
    return { error: `No se pudo actualizar el paquete: ${error.message}` };
  }

  if (current.status !== status) {
    await insertHistory(id, status, String(formData.get("note") ?? "").trim() || null);
  }

  revalidatePath("/paquetes");
  revalidatePath("/");
  redirect("/paquetes");
}

export async function deletePackageAction(formData: FormData) {
  await requireUser();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "");

  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) {
    redirect(`/paquetes?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/paquetes");
  revalidatePath("/");
  redirect("/paquetes");
}

export async function updatePackageWeight(
  packageId: string,
  pesoLb: number
): Promise<{ error?: string }> {
  await requireUser();
  if (!Number.isFinite(pesoLb) || pesoLb < 0) {
    return { error: "Peso inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({ peso_lb: pesoLb })
    .eq("id", packageId);
  if (error) return { error: error.message };

  revalidatePath("/paquetes");
  revalidatePath(`/paquetes/${packageId}`);
  revalidatePath("/");
  return {};
}

export async function updatePackageDescription(
  packageId: string,
  descripcion: string | null
): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();

  const value = descripcion?.trim() || null;
  const { error } = await supabase
    .from("packages")
    .update({ descripcion: value })
    .eq("id", packageId);
  if (error) return { error: error.message };

  revalidatePath("/paquetes");
  revalidatePath(`/paquetes/${packageId}`);
  revalidatePath("/");
  return {};
}

export async function updatePackageStatus(
  packageId: string,
  newStatus: PackageStatus,
  pagado: boolean | null
): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("packages")
    .select("status")
    .eq("id", packageId)
    .single();
  if (fetchError || !current) {
    return { error: `No se pudo leer el paquete: ${fetchError?.message ?? "no encontrado"}` };
  }

  const { error } = await supabase
    .from("packages")
    .update({
      status: newStatus,
      pagado,
    })
    .eq("id", packageId);
  if (error) return { error: error.message };

  if (current.status !== newStatus) {
    await insertHistory(packageId, newStatus, null);
  }

  revalidatePath("/paquetes");
  revalidatePath(`/paquetes/${packageId}`);
  revalidatePath("/");
  return {};
}

export async function bulkUpdatePackages(
  ids: string[],
  changes: { status?: PackageStatus; pagado?: boolean }
): Promise<{ error?: string; updated?: number }> {
  await requireUser();
  if (ids.length === 0) return { error: "No hay paquetes seleccionados." };

  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {};
  if (changes.status !== undefined) updatePayload.status = changes.status;
  if (changes.pagado !== undefined) updatePayload.pagado = changes.pagado;
  if (Object.keys(updatePayload).length === 0) {
    return { error: "No se especificaron cambios." };
  }

  const { data, error } = await supabase
    .from("packages")
    .update(updatePayload)
    .in("id", ids)
    .select("id, status");

  if (error) return { error: error.message };

  if (changes.status && data) {
    for (const pkg of data) {
      await insertHistory(pkg.id, changes.status, null);
    }
  }

  revalidatePath("/paquetes");
  revalidatePath("/");
  return { updated: data?.length ?? 0 };
}

export async function bulkDeletePackages(
  ids: string[]
): Promise<{ error?: string; deleted?: number }> {
  await requireUser();
  if (ids.length === 0) return { error: "No hay paquetes seleccionados." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/paquetes");
  revalidatePath("/");
  return { deleted: data?.length ?? 0 };
}
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_EXCHANGE_RATE_CRC = 450;

export const SETTINGS_KEY_TIPO_CAMBIO = "cambio_usd_crc";

/**
 * Resuelve el dólar a usar para un paquete: su snapshot `tipo_cambio` si es
 * válido, o el `fallback` (dólar global) si no.
 */
export function resolveRate(
  snapshot: number | string | null | undefined,
  fallback: number
): number {
  const value = Number(snapshot);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function getExchangeRate(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY_TIPO_CAMBIO)
      .maybeSingle();
    const value = Number(data?.value);
    return Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_EXCHANGE_RATE_CRC;
  } catch {
    return DEFAULT_EXCHANGE_RATE_CRC;
  }
}
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePackageStatus,
  updatePackageWeight,
} from "@/lib/actions/packages";
import {
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_ORDER,
  type PackageStatus,
} from "@/lib/types";
import { formatCurrencyCRC } from "@/lib/format";
import { resolveRate } from "@/lib/settings";

function usePackageRowState({
  initialStatus,
  initialPagado,
  initialPesoLb,
}: {
  initialStatus: PackageStatus;
  initialPagado: boolean | null;
  initialPesoLb: number | string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [status, setStatus] = useState<PackageStatus>(initialStatus);
  const [pagado, setPagado] = useState<boolean>(initialPagado === true);
  const [pesoText, setPesoText] = useState<string>(
    String(Number(initialPesoLb))
  );

  const [prevServer, setPrevServer] = useState({
    status: initialStatus,
    pagado: initialPagado === true,
    pesoLb: initialPesoLb,
  });
  if (
    !isPending &&
    (prevServer.status !== initialStatus ||
      prevServer.pagado !== (initialPagado === true) ||
      prevServer.pesoLb !== initialPesoLb)
  ) {
    setPrevServer({
      status: initialStatus,
      pagado: initialPagado === true,
      pesoLb: initialPesoLb,
    });
    setStatus(initialStatus);
    setPagado(initialPagado === true);
    setPesoText(String(Number(initialPesoLb)));
  }

  const parsedPeso = Number(pesoText.replace(",", "."));
  const totalPeso =
    Number.isFinite(parsedPeso) && parsedPeso >= 0
      ? parsedPeso
      : Number(initialPesoLb);

  function commit(
    run: () => Promise<{ error?: string }>,
    rollback: () => void
  ) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await run();
      if (result.error) {
        setError(result.error);
        rollback();
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function handleStatusChange(packageId: string, next: PackageStatus) {
    if (next === status) return;
    setStatus(next);
    commit(
      () => updatePackageStatus(packageId, next, null),
      () => setStatus(initialStatus)
    );
  }

  function handlePagadoChange(packageId: string, next: boolean) {
    if (next === pagado) return;
    setPagado(next);
    commit(
      () => updatePackageStatus(packageId, status, next),
      () => setPagado(initialPagado === true)
    );
  }

  function saveWeight(packageId: string) {
    const weight = Number(pesoText.replace(",", "."));
    if (Number.isNaN(weight) || weight < 0) {
      setError("Peso inválido");
      setSaved(false);
      return;
    }
    if (weight === Number(initialPesoLb)) return;
    setPesoText(String(weight));
    commit(
      () => updatePackageWeight(packageId, weight),
      () => setPesoText(String(Number(initialPesoLb)))
    );
  }

  return {
    isPending,
    error,
    saved,
    status,
    pagado,
    pesoText,
    totalPeso,
    setPesoText,
    setSaved,
    handleStatusChange,
    handlePagadoChange,
    saveWeight,
  };
}

const controlClassName =
  "rounded-md border border-brand-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50";

export function PackageRow({
  packageId,
  status: initialStatus,
  pagado: initialPagado,
  pesoLb: initialPesoLb,
  tarifaLb,
  rate,
  tipoCambio,
  cellClassName = "px-5 py-3",
}: {
  packageId: string;
  status: PackageStatus;
  pagado: boolean | null;
  pesoLb: number | string;
  tarifaLb: number | string;
  rate: number;
  tipoCambio?: number | string | null;
  cellClassName?: string;
}) {
  const {
    isPending,
    error,
    saved,
    status,
    pagado,
    pesoText,
    totalPeso,
    setPesoText,
    setSaved,
    handleStatusChange,
    handlePagadoChange,
    saveWeight,
  } = usePackageRowState({
    initialStatus,
    initialPagado,
    initialPesoLb,
  });
  const totalCRC = totalPeso * Number(tarifaLb) * resolveRate(tipoCambio, rate);

  return (
    <>
      <td className={cellClassName}>
        <select
          value={status}
          onChange={(e) => handleStatusChange(packageId, e.target.value as PackageStatus)}
          disabled={isPending}
          aria-label="Cambiar estado"
          className={controlClassName}
        >
          {PACKAGE_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PACKAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className={cellClassName}>
        <select
          value={pagado ? "true" : "false"}
          onChange={(e) => handlePagadoChange(packageId, e.target.value === "true")}
          disabled={isPending}
          aria-label="Estado de pago"
          className={controlClassName}
        >
          <option value="false">No</option>
          <option value="true">Sí</option>
        </select>
      </td>
      <td className={cellClassName}>
        <div className="flex items-center gap-1">
          <input
            type="number"
            step="0.01"
            min="0"
            value={pesoText}
            onChange={(e) => {
              setPesoText(e.target.value);
              setSaved(false);
            }}
            onBlur={() => saveWeight(packageId)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveWeight(packageId);
              }
            }}
            disabled={isPending}
            aria-label="Peso en libras"
            className="w-20 rounded-md border border-brand-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
          />
          <span className="text-xs text-gray-400">lb</span>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {saved && !error && (
          <p className="mt-1 text-xs text-emerald-600">Guardado</p>
        )}
      </td>
      <td className={`${cellClassName} font-medium text-gray-900`}>
        {formatCurrencyCRC(totalCRC)}
        {isPending && <span className="ml-1 text-xs text-gray-400">…</span>}
      </td>
    </>
  );
}

export function PackageControls({
  packageId,
  status: initialStatus,
  pagado: initialPagado,
  pesoLb: initialPesoLb,
  tarifaLb,
  rate,
  tipoCambio,
}: {
  packageId: string;
  status: PackageStatus;
  pagado: boolean | null;
  pesoLb: number | string;
  tarifaLb: number | string;
  rate: number;
  tipoCambio?: number | string | null;
}) {
  const {
    isPending,
    error,
    saved,
    status,
    pagado,
    pesoText,
    totalPeso,
    setPesoText,
    setSaved,
    handleStatusChange,
    handlePagadoChange,
    saveWeight,
  } = usePackageRowState({
    initialStatus,
    initialPagado,
    initialPesoLb,
  });
  const totalCRC = totalPeso * Number(tarifaLb) * resolveRate(tipoCambio, rate);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">
          Estado
        </label>
        <select
          value={status}
          onChange={(e) => handleStatusChange(packageId, e.target.value as PackageStatus)}
          disabled={isPending}
          aria-label="Cambiar estado"
          className={`${controlClassName} w-full`}
        >
          {PACKAGE_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PACKAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">
          Pagado
        </label>
        <select
          value={pagado ? "true" : "false"}
          onChange={(e) => handlePagadoChange(packageId, e.target.value === "true")}
          disabled={isPending}
          aria-label="Estado de pago"
          className={`${controlClassName} w-full`}
        >
          <option value="false">No</option>
          <option value="true">Sí</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">
          Peso (lb)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={pesoText}
          onChange={(e) => {
            setPesoText(e.target.value);
            setSaved(false);
          }}
          onBlur={() => saveWeight(packageId)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveWeight(packageId);
            }
          }}
          disabled={isPending}
          aria-label="Peso en libras"
          className={`${controlClassName} w-full`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-700">
          Total (₡)
        </label>
        <p className="pt-1.5 text-sm font-medium text-gray-900">
          {formatCurrencyCRC(totalCRC)}
        </p>
      </div>
      {error && <p className="col-span-full text-xs text-red-600">{error}</p>}
      {saved && !error && (
        <p className="col-span-full text-xs text-emerald-600">Guardado</p>
      )}
    </div>
  );
}
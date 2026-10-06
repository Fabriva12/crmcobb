"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DEFAULT_TARIFF_LB,
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_ORDER,
  relationSingle,
  type PackageStatus,
} from "@/lib/types";
import { formatDateNumeric, normalizeSearch } from "@/lib/format";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { ConfirmDeleteForm } from "@/components/confirm-delete-form";
import {
  deletePackageAction,
  bulkUpdatePackages,
  bulkDeletePackages,
  updatePackageDescription,
} from "@/lib/actions/packages";
import { PackageRow, PackageControls } from "@/components/package-row";

const SIN_LISTA = "__sin_lista__";

type PaqueteRow = {
  id: string;
  tracking_number: string | null;
  status: string;
  peso_lb: number | string | null;
  tarifa_lb: number | string | null;
  tipo_cambio: number | string | null;
  pagado: boolean | null;
  created_at: string | null;
  descripcion: string | null;
  lista_id: string | null;
  fecha_recepcion: string | null;
  vuelo: string | null;
  package_lists:
    | { nombre?: string | null }
    | { nombre?: string | null }[]
    | null;
  clients:
    | { id?: string; nombre?: string | null; telefono?: string | null }
    | { id?: string; nombre?: string | null; telefono?: string | null }[]
    | null;
};

export function PaquetesTable({
  paquetes,
  rate,
  initialStatus = "",
  lists = [],
  initialLista = "",
  initialPagado = "",
}: {
  paquetes: PaqueteRow[];
  rate: number;
  initialStatus?: string;
  lists?: { id: string; nombre: string }[];
  initialLista?: string;
  initialPagado?: string;
}) {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>(
    PACKAGE_STATUS_ORDER.includes(initialStatus as PackageStatus)
      ? initialStatus
      : ""
  );
  const [lista, setLista] = useState<string>(
    lists.some((l) => l.id === initialLista) ? initialLista : ""
  );
  const [pagado, setPagado] = useState<string>(
    initialPagado === "true" || initialPagado === "false" ? initialPagado : ""
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = normalizeSearch(q.trim());
    return paquetes.filter((p) => {
      if (estado && p.status !== estado) return false;
      if (lista === SIN_LISTA) {
        if (p.lista_id !== null) return false;
      } else if (lista && p.lista_id !== lista) {
        return false;
      }
      if (pagado === "true" && p.pagado !== true) return false;
      if (pagado === "false" && p.pagado === true) return false;
      if (!needle) return true;
      const tracking = normalizeSearch(p.tracking_number ?? "");
      const cliente = normalizeSearch(relationSingle(p.clients)?.nombre ?? "");
      return tracking.includes(needle) || cliente.includes(needle);
    });
  }, [paquetes, q, estado, lista, pagado]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(() => {
      if (allFilteredSelected) return new Set<string>();
      return new Set(filtered.map((p) => p.id));
    });
  }, [filtered, allFilteredSelected]);

  if (paquetes.length === 0) {
    return (
      <Card>
        <EmptyState message="Todavía no hay paquetes registrados." />
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="space-y-4">
        <BuscarPaquetes
          q={q}
          setQ={setQ}
          estado={estado}
          setEstado={setEstado}
          lista={lista}
          setLista={setLista}
          pagado={pagado}
          setPagado={setPagado}
          lists={lists}
          total={paquetes.length}
        />
        <Card>
          <EmptyState message="Sin paquetes que coincidan con el filtro." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BuscarPaquetes
          q={q}
          setQ={setQ}
          estado={estado}
          setEstado={setEstado}
          lista={lista}
          setLista={setLista}
          pagado={pagado}
          setPagado={setPagado}
          lists={lists}
          total={paquetes.length}
        />
      {selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          statuses={PACKAGE_STATUS_ORDER.map((s) => ({
            value: s,
            label: PACKAGE_STATUS_LABELS[s],
          }))}
          onApply={(status, pagado) => {
            const changes: { status?: PackageStatus; pagado?: boolean } = {};
            if (status) changes.status = status;
            if (pagado !== null) changes.pagado = pagado;
            return bulkUpdatePackages([...selectedIds], changes);
          }}
          onDelete={() => bulkDeletePackages([...selectedIds])}
          onClear={() => setSelectedIds(new Set())}
          onDone={() => setSelectedIds(new Set())}
        />
      )}

      {/* Mobile: cards view */}
      <div className="space-y-3 md:hidden">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {filtered.length} de {paquetes.length}
          </p>
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {allFilteredSelected ? "Quitar selección" : "Seleccionar todos"}
          </button>
        </div>
        {filtered.map((p) => (
          <Card key={p.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  aria-label={`Seleccionar paquete ${p.tracking_number ?? p.id}`}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <div className="min-w-0">
                  <Link
                    href={`/paquetes/${p.id}`}
                    className="break-all font-mono text-xs font-medium text-brand-600 hover:underline"
                  >
                    {p.tracking_number}
                  </Link>
                  <p className="mt-0.5 text-sm text-gray-700">
                    {relationSingle(p.clients)?.nombre ?? (
                      <span className="italic text-gray-400">Sin asignar</span>
                    )}
                  </p>
                </div>
              </div>
              <PaqueteActions p={p} />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium text-brand-700">
                Descripción
              </label>
              <DescripcionInline packageId={p.id} initial={p.descripcion} />
            </div>
            <PackageControls
              packageId={p.id}
              status={p.status as PackageStatus}
              pagado={p.pagado}
              pesoLb={p.peso_lb ?? 0}
              tarifaLb={p.tarifa_lb ?? DEFAULT_TARIFF_LB}
              rate={rate}
              tipoCambio={p.tipo_cambio}
            />
            <p className="pt-1 text-xs text-gray-400">
              Vuelo: {p.vuelo || "—"} · Bodega: {formatDateNumeric(p.fecha_recepcion)}
            </p>
          </Card>
        ))}
      </div>

      {/* Desktop: table view */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-700">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todos los paquetes visibles"
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Seguimiento</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Descripción</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Estado</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Pagado</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Peso</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Total (₡)</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Vuelo</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Bodega</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      aria-label={`Seleccionar paquete ${p.tracking_number ?? p.id}`}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/paquetes/${p.id}`}
                      className="font-mono text-xs font-medium text-brand-600 hover:underline"
                    >
                      {p.tracking_number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                    {relationSingle(p.clients)?.nombre ?? (
                      <span className="italic text-gray-400">Sin asignar</span>
                    )}
                  </td>
                  <td className="max-w-40 px-4 py-3 text-gray-600">
                    <DescripcionInline packageId={p.id} initial={p.descripcion} />
                  </td>
                  <PackageRow
                    packageId={p.id}
                    status={p.status as PackageStatus}
                    pagado={p.pagado}
                    pesoLb={p.peso_lb ?? 0}
                    tarifaLb={p.tarifa_lb ?? DEFAULT_TARIFF_LB}
                    rate={rate}
                    tipoCambio={p.tipo_cambio}
                    cellClassName="whitespace-nowrap px-4 py-3"
                  />
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {p.vuelo || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {formatDateNumeric(p.fecha_recepcion)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <PaqueteActions p={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PaqueteActions({ p }: { p: PaqueteRow }) {
  const cliente = relationSingle(p.clients);
  const numero = waNumber(cliente?.telefono ?? "");
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/paquetes/${p.id}#editar`}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        Editar
      </Link>
      {numero ? (
        <a
          href={whatsappUrl(
            numero,
            cliente?.nombre ?? null,
            p.tracking_number
          )}
          target="_blank"
          rel="noopener noreferrer"
          title="Enviar aviso por WhatsApp"
          aria-label="Enviar aviso por WhatsApp"
          className="inline-flex text-emerald-600 transition hover:text-emerald-700"
        >
          <WhatsAppIcon />
        </a>
      ) : (
        <span
          className="inline-flex cursor-not-allowed text-gray-300"
          title="El cliente no tiene teléfono registrado"
          aria-label="WhatsApp no disponible"
        >
          <WhatsAppIcon />
        </span>
      )}
      <ConfirmDeleteForm
        action={deletePackageAction}
        id={p.id}
        confirmMessage={`¿Eliminar el paquete ${p.tracking_number}?`}
      >
        <Button
          type="submit"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
        >
          Eliminar
        </Button>
      </ConfirmDeleteForm>
    </div>
  );
}

function DescripcionInline({
  packageId,
  initial,
}: {
  packageId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [prevInitial, setPrevInitial] = useState(initial);
  if (!isPending && prevInitial !== initial) {
    setPrevInitial(initial);
    setText(initial ?? "");
  }

  function commit() {
    const value = text.trim();
    const normalized = value || null;
    if (normalized === (initial?.trim() || null)) {
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePackageDescription(packageId, normalized);
      if (result.error) {
        setError(result.error);
        setText(initial ?? "");
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-full">
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={isPending}
        placeholder="—"
        aria-label="Descripción del paquete"
        title={text}
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs text-gray-600 shadow-none outline-none transition hover:border-brand-300 hover:bg-white focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {saved && !error && (
        <p className="mt-1 text-xs text-emerald-600">Guardado</p>
      )}
    </div>
  );
}

function BulkActionsBar({
  count,
  statuses,
  onApply,
  onDelete,
  onClear,
  onDone,
}: {
  count: number;
  statuses: { value: string; label: string }[];
  onApply: (
    status: PackageStatus | null,
    pagado: boolean | null
  ) => Promise<{ error?: string; updated?: number }>;
  onDelete: () => Promise<{ error?: string; deleted?: number }>;
  onClear: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [status, setStatus] = useState<string>("");
  const [pagado, setPagado] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const pending = isPending || isDeleting;

  function handleApply() {
    setError(null);
    startTransition(async () => {
      const result = await onApply(
        status ? (status as PackageStatus) : null,
        pagado === "" ? null : pagado === "true"
      );
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
        setStatus("");
        setPagado("");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    setError(null);
    const message = `¿Eliminar ${count} paquete${count !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`;
    if (!window.confirm(message)) return;
    startDeleting(async () => {
      const result = await onDelete();
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
        setStatus("");
        setPagado("");
        router.refresh();
      }
    });
  }

  const anyChange = status !== "" || pagado !== "";

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <p className="text-sm font-medium text-gray-700">
        {count} paquete{count !== 1 && "s"} seleccionado{count !== 1 && "s"}
      </p>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={pending}
          aria-label="Cambiar estado de seleccionados"
          className="rounded-md border border-brand-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
        >
          <option value="">Estado: no cambiar</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              Estado: {s.label}
            </option>
          ))}
        </select>
        <select
          value={pagado}
          onChange={(e) => setPagado(e.target.value)}
          disabled={pending}
          aria-label="Cambiar pagado de seleccionados"
          className="rounded-md border border-brand-300 bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
        >
          <option value="">Pagado: no cambiar</option>
          <option value="true">Pagado: Sí</option>
          <option value="false">Pagado: No</option>
        </select>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={pending || !anyChange}
        >
          {isPending ? "Aplicando…" : "Aplicar"}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={handleDelete}
          disabled={pending}
        >
          {isDeleting ? "Eliminando…" : "Eliminar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={pending}
        >
          Limpiar
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function BuscarPaquetes({
  q,
  setQ,
  estado,
  setEstado,
  lista,
  setLista,
  pagado,
  setPagado,
  lists,
  total,
}: {
  q: string;
  setQ: (value: string) => void;
  estado: string;
  setEstado: (value: string) => void;
  lista: string;
  setLista: (value: string) => void;
  pagado: string;
  setPagado: (value: string) => void;
  lists: { id: string; nombre: string }[];
  total: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por tracking o cliente..."
          aria-label="Buscar paquetes"
        />
      </div>
      <div className="sm:w-48">
        <Select
          value={lista}
          onChange={(e) => setLista(e.target.value)}
          aria-label="Filtrar por lista"
        >
          <option value="">Todas las listas</option>
          <option value={SIN_LISTA}>Sin lista</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-48">
        <Select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {PACKAGE_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PACKAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-48">
        <Select
          value={pagado}
          onChange={(e) => setPagado(e.target.value)}
          aria-label="Filtrar por pago"
        >
          <option value="">Todos los pagos</option>
          <option value="true">Pagados</option>
          <option value="false">No pagados</option>
        </Select>
      </div>
      <p className="text-xs text-gray-400">{total} paquetes</p>
    </div>
  );
}

function waNumber(telefono: string): string {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("506")
    ? digits
    : digits.length === 8
      ? `506${digits}`
      : digits;
}

function whatsappUrl(
  numero: string,
  nombre: string | null,
  tracking: string | null
): string {
  const nombreFinal = nombre?.trim() || "cliente";
  const message = `Hola ${nombreFinal}! Tu paquete ${tracking ?? ""} ya llegó.`.trim();
  return `whatsapp://send?phone=${numero}&text=${encodeURIComponent(message)}`;
}

function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePackageAction, updatePackageAction } from "@/lib/actions/packages";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatCurrencyCRC, formatDate, formatWeight } from "@/lib/format";
import { getExchangeRate, resolveRate } from "@/lib/settings";
import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
  Badge,
} from "@/components/ui";
import { ConfirmDeleteForm } from "@/components/confirm-delete-form";
import { PackageStatusButtons } from "@/components/package-status-buttons";
import { relationSingle } from "@/lib/types";
import { PackageForm } from "../paquete-form";

export default async function PaqueteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const supabase = await createClient();
  const rate = await getExchangeRate(supabase);
  const { id } = await params;

  const [pkgRes, historyRes, clientsRes] = await Promise.all([
    supabase.from("packages").select("*, clients(id, nombre)").eq("id", id).single(),
    supabase
      .from("package_status_history")
      .select("*")
      .eq("package_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, nombre, telefono").order("nombre", { ascending: true }),
  ]);

  if (pkgRes.error || !pkgRes.data) {
    notFound();
  }

  const pkg = pkgRes.data;
  const history = historyRes.data ?? [];
  const client = relationSingle(pkg.clients);
  const pkgRate = resolveRate(pkg.tipo_cambio, rate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-all font-mono text-2xl font-bold text-gray-900">
            {pkg.tracking_number}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={pkg.status} />
            {pkg.status === "entregado" && (
              pkg.pagado ? (
                <Badge color="green">Pagado</Badge>
              ) : (
                <Badge color="amber">Pendiente de pago</Badge>
              )
            )}
            <p className="text-sm text-gray-500">
              {client?.nombre ?? "Sin cliente asignado"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="#editar">
            <Button className="w-full sm:w-auto">Editar</Button>
          </Link>
          <Link href="/paquetes">
            <Button variant="secondary" className="w-full sm:w-auto">
              Volver
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Cambiar estado
        </h2>
        <PackageStatusButtons
          packageId={pkg.id}
          currentStatus={pkg.status}
          currentPagado={pkg.pagado}
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-2xl font-bold text-gray-900">
            {formatWeight(pkg.peso_lb)} lb
          </p>
          <p className="mt-1 text-sm text-gray-500">Peso</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(pkg.tarifa_lb)}
          </p>
          <p className="mt-1 text-sm text-gray-500">Tarifa por libra</p>
        </Card>
        <Card className="border-brand-200 bg-brand-50/50">
          <p className="text-2xl font-bold text-brand-600">
            {formatCurrencyCRC(Number(pkg.total || 0) * pkgRate)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Total (₡) · fijado a 1 $ = {pkgRate} ₡
          </p>
        </Card>
      </div>

      <Card id="editar">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Editar paquete
        </h2>
        <PackageForm
          action={updatePackageAction}
          clients={(clientsRes.data ?? []).map((c) => ({
            id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
          }))}
          initial={{
            id: pkg.id,
            tracking_number: pkg.tracking_number,
            client_id: pkg.client_id,
            status: pkg.status,
            peso_lb: Number(pkg.peso_lb),
            tarifa_lb: Number(pkg.tarifa_lb),
            pagado: pkg.pagado,
            descripcion: pkg.descripcion ?? "",
            notas: pkg.notas ?? "",
            vuelo: pkg.vuelo ?? "",
            fecha_recepcion: pkg.fecha_recepcion?.slice(0, 10) ?? null,
          }}
        />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Historial del paquete
        </h2>
        {history.length === 0 ? (
          <EmptyState message="Sin cambios de estado registrados." />
        ) : (
          <ol className="space-y-4">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-start gap-3 border-l-2 border-gray-200 pl-4"
              >
                <div>
                  <StatusBadge status={h.status} />
                  <p className="mt-1 text-xs text-gray-500">
                    {formatDate(h.created_at)}
                  </p>
                  {h.note && (
                    <p className="mt-1 text-sm text-gray-700">{h.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {pkg.descripcion && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            Descripción
          </h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {pkg.descripcion}
          </p>
        </Card>
      )}

      {pkg.notas && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Notas</h2>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {pkg.notas}
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <ConfirmDeleteForm
          action={deletePackageAction}
          id={pkg.id}
          confirmMessage={`¿Eliminar el paquete ${pkg.tracking_number}?`}
        >
          <Button type="submit" variant="danger">
            Eliminar paquete
          </Button>
        </ConfirmDeleteForm>
      </div>
    </div>
  );
}
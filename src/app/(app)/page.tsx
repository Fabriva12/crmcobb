import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  PACKAGE_STATUS_LABELS,
  relationSingle,
  type PackageStatus,
} from "@/lib/types";
import { formatCurrencyCRC, formatDateNumeric } from "@/lib/format";
import { getExchangeRate, resolveRate } from "@/lib/settings";
import { Button, Card, EmptyState } from "@/components/ui";
import { PackageRow, PackageControls } from "@/components/package-row";

const statuses: PackageStatus[] = [
  "en_camino",
  "disponible",
  "entregado",
];

export default async function DashboardPage() {
  await requireUser();
  const supabase = await createClient();
  const rate = await getExchangeRate(supabase);

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString();

  const [packagesRes, deliveredRes, recentRes] = await Promise.all([
    supabase.from("packages").select("status"),
    supabase
      .from("packages")
      .select("total, pagado, tipo_cambio, created_at")
      .eq("status", "entregado"),
    supabase
      .from("packages")
      .select("id, tracking_number, status, peso_lb, tarifa_lb, tipo_cambio, total, pagado, created_at, clients(nombre)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const counts: Record<PackageStatus, number> = {
    en_camino: 0,
    disponible: 0,
    entregado: 0,
  };
  for (const p of packagesRes.data ?? []) {
    counts[p.status as PackageStatus] = (counts[p.status as PackageStatus] ?? 0) + 1;
  }

  const delivered = deliveredRes.data ?? [];
  const monthRevenue = delivered
    .filter((p) => p.pagado === true && p.created_at >= monthStart)
    .reduce(
      (acc, p) => acc + (Number(p.total) || 0) * resolveRate(p.tipo_cambio, rate),
      0
    );
  const totalPending = delivered
    .filter((p) => p.pagado !== true)
    .reduce(
      (acc, p) => acc + (Number(p.total) || 0) * resolveRate(p.tipo_cambio, rate),
      0
    );

  const recent = recentRes.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Panel de control</h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/paquetes/nuevo">
            <Button className="w-full sm:w-auto">Registrar paquete</Button>
          </Link>
          <Link href="/clientes/nuevo">
            <Button variant="secondary" className="w-full sm:w-auto">
              Nuevo cliente
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-5">
        {statuses.map((s) => (
          <Link key={s} href={`/paquetes?status=${s}`}>
            <Card className="transition hover:shadow-md">
              <p className="text-3xl font-bold text-gray-900">{counts[s]}</p>
              <p className="mt-1 text-sm text-gray-500">
                {PACKAGE_STATUS_LABELS[s]}
              </p>
            </Card>
          </Link>
        ))}
        <Card className="border-brand-200 bg-brand-50/50">
          <p className="break-words text-xl font-bold text-brand-600 sm:text-3xl">
            {formatCurrencyCRC(monthRevenue)}
          </p>
          <p className="mt-1 text-sm text-gray-500">Cobrado este mes (₡)</p>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="break-words text-xl font-bold text-amber-600 sm:text-3xl">
            {formatCurrencyCRC(totalPending)}
          </p>
          <p className="mt-1 text-sm text-gray-500">Adeudo total (₡)</p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Últimos paquetes
          </h2>
          <Link
            href="/paquetes"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Ver todos
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState message="Todavía no hay paquetes registrados." />
        ) : (
          <>
            {/* Mobile: cards view */}
            <div className="space-y-3 md:hidden">
              {recent.map((p) => (
                <Card key={p.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/paquetes/${p.id}`}
                        className="break-all font-mono text-xs font-medium text-brand-600 hover:underline"
                      >
                        {p.tracking_number}
                      </Link>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {relationSingle(p.clients)?.nombre ?? "Sin asignar"}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-gray-400">
                      {formatDateNumeric(p.created_at)}
                    </p>
                  </div>
                  <PackageControls
                    packageId={p.id}
                    status={p.status as PackageStatus}
                    pagado={p.pagado as boolean | null}
                    pesoLb={p.peso_lb}
                    tarifaLb={p.tarifa_lb}
                    rate={rate}
                    tipoCambio={p.tipo_cambio}
                  />
                </Card>
              ))}
            </div>

            {/* Desktop: table view */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-brand-200 text-xs uppercase tracking-wide text-brand-700">
                    <th className="pb-2 pr-4 font-semibold">Seguimiento</th>
                    <th className="pb-2 pr-4 font-semibold">Cliente</th>
                    <th className="pb-2 pr-4 font-semibold">Estado</th>
                    <th className="pb-2 pr-4 font-semibold">Pagado</th>
                    <th className="pb-2 pr-4 font-semibold">Peso</th>
                    <th className="pb-2 pr-4 font-semibold">Total (₡)</th>
                    <th className="pb-2 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/paquetes/${p.id}`}
                          className="font-mono text-xs font-medium text-brand-600 hover:underline"
                        >
                          {p.tracking_number}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">
                        {relationSingle(p.clients)?.nombre ?? "Sin asignar"}
                      </td>
                      <PackageRow
                        packageId={p.id}
                        status={p.status as PackageStatus}
                        pagado={p.pagado as boolean | null}
                        pesoLb={p.peso_lb}
                        tarifaLb={p.tarifa_lb}
                        rate={rate}
                        tipoCambio={p.tipo_cambio}
                        cellClassName="py-2.5 pr-4"
                      />
                      <td className="py-2.5 text-gray-500">
                        {formatDateNumeric(p.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
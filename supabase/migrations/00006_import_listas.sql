-- Cobb Logistic CRM - Listas de importación + fecha de recepción + limpieza automática
-- Ejecutar en Supabase Dashboard -> SQL Editor (después de 00005_package_notas.sql)

-- 1. Tabla de listas (una por cada importación semanal)
create table if not exists public.package_lists (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists package_lists_created_at_idx
  on public.package_lists (created_at desc);

-- 2. Asociar paquetes a una lista y guardar la fecha de recepción del Excel


-- 3. RLS para package_lists
alter table public.package_lists enable row level security;

create policy "authenticated_select_lists"
  on public.package_lists for select to authenticated using (true);

create policy "authenticated_insert_lists"
  on public.package_lists for insert to authenticated with check (true);

create policy "authenticated_update_lists"
  on public.package_lists for update to authenticated using (true) with check (true);

create policy "authenticated_delete_lists"
  on public.package_lists for delete to authenticated using (true);

-- 4. Limpieza automática: borrar listas creadas hace más de 2 meses.
--    Por cascade se borran también los paquetes de esa lista y su historial.
create extension if not exists pg_cron;

select cron.unschedule('cleanup_lists_2_months')
where exists (select 1 from cron.job where jobname = 'cleanup_lists_2_months');

select cron.schedule(
  'cleanup_lists_2_months',
  '0 5 * * *',
  $$ delete from public.package_lists where created_at < now() - interval '2 months' $$
);
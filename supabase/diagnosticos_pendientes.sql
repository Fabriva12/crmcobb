-- Diagnóstico: ¿de dónde sale el "Pendiente de cobro" del dashboard?
-- Correr en el SQL Editor de Supabase y pegar el resultado completo.

with tasa as (
  select coalesce(
    (select value from public.settings where key = 'cambio_usd_crc'),
    450
  )::numeric as v
),
inicio_mes as (
  select date_trunc('month', now() at time zone 'America/Costa_Rica')
         at time zone 'America/Costa_Rica' as t
),
pend_mes as (
  select p.*
  from public.packages p, inicio_mes
  where p.status = 'entregado'
    and p.created_at >= inicio_mes.t
    and p.pagado is distinct from true
),
pend_previos as (
  select p.*
  from public.packages p, inicio_mes
  where p.status = 'entregado'
    and p.created_at < inicio_mes.t
    and p.pagado is distinct from true
),
pend_all as (
  select * from public.packages
  where status = 'entregado' and pagado is distinct from true
),
en_camino as (
  select * from public.packages where status <> 'entregado'
)
select * from (
  select 1 as orden, 'tasa_global' as concepto,
         (select v from tasa)::text as valor
  union all
  select 2, 'total_paquetes', count(*)::text from public.packages
  union all
  select 3, 'paquetes_por_estado',
         string_agg(status || ': ' || n, ' | ' order by status)
  from (select status, count(*) as n from public.packages group by status) e
  union all
  select 4, 'entregado_por_pagado',
         string_agg(k || ': ' || n, ' | ' order by k)
  from (
    select case when pagado then 'pagado=true'
                when not pagado then 'pagado=false'
                else 'pagado=null' end as k,
           count(*) as n
    from public.packages where status = 'entregado' group by 1
  ) x
  union all
  -- ===== el KPI del dashboard =====
  select 5, 'KPI_pendientes_cantidad', count(*)::text from pend_mes
  union all
  select 6, 'KPI_pendientes_suma_USD', coalesce(round(sum(total), 2), 0)::text from pend_mes
  union all
  select 7, 'KPI_pendientes_CRC_tasa_global',
         (coalesce(round(sum(total), 2), 0) * (select v from tasa))::text
  from pend_mes
  union all
  select 8, 'KPI_pendientes_CRC_por_fila',
         coalesce(round(sum(total * coalesce(tipo_cambio, (select v from tasa))), 2), 0)::text
  from pend_mes
  union all
  select 9, 'KPI_pend_pagado_false', count(*)::text from pend_mes where pagado = false
  union all
  select 10, 'KPI_pend_pagado_null_sin_definir', count(*)::text from pend_mes where pagado is null
  union all
  select 11, 'KPI_cobrado_cantidad', count(*)::text
  from public.packages p, inicio_mes
  where p.status = 'entregado' and p.created_at >= inicio_mes.t and p.pagado is true
  union all
  select 12, 'KPI_cobrado_CRC_tasa_global',
         (coalesce(round(sum(p.total), 2), 0) * (select v from tasa))::text
  from public.packages p, inicio_mes
  where p.status = 'entregado' and p.created_at >= inicio_mes.t and p.pagado is true
  union all
  -- ===== fuera del KPI =====
  select 13, 'pendientes_meses_anteriores_cantidad', count(*)::text from pend_previos
  union all
  select 14, 'pendientes_meses_anteriores_USD', coalesce(round(sum(total), 2), 0)::text from pend_previos
  union all
  select 15, 'pendientes_entregado_historico_cantidad', count(*)::text from pend_all
  union all
  select 16, 'pendientes_entregado_historico_USD', coalesce(round(sum(total), 2), 0)::text from pend_all
  union all
  select 17, 'en_camino_o_disponible_no_entra_al_KPI_cantidad', count(*)::text from en_camino
  union all
  select 18, 'en_camino_o_disponible_USD', coalesce(round(sum(total), 2), 0)::text from en_camino
  union all
  -- ===== composición de los pendientes del mes =====
  select 19, 'top10_pendientes_mes',
         string_agg(
           coalesce(tracking_number, '(sin tracking)') || ' = $' || round(total, 2)
           || ' (' || peso_lb || ' lb x ' || tarifa_lb || ', pagado='
           || coalesce(pagado::text, 'null') || ')',
           E'\n' order by total desc
         )
  from (select * from pend_mes order by total desc limit 10) t
  union all
  select 20, 'pendientes_mes_por_tarifa',
         string_agg('tarifa $' || tarifa_lb::text || ' -> ' || n || ' paq, $' || suma,
                    ' | ' order by suma_usd desc)
  from (
    select tarifa_lb, count(*) as n, round(sum(total), 2) as suma,
           sum(total) as suma_usd
    from pend_mes group by tarifa_lb
  ) t
  union all
  select 21, 'pendientes_mes_peso_max', coalesce(max(peso_lb), 0)::text from pend_mes
  union all
  select 22, 'pendientes_mes_total_max', coalesce(max(total), 0)::text from pend_mes
  union all
  select 23, 'distinct_tarifas_en_tabla',
         string_agg(distinct tarifa_lb::text, ', ')
  from public.packages
) d
order by orden;

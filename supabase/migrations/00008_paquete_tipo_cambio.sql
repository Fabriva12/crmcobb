-- Cobb: snapshot del tipo de cambio por paquete.
-- El dólar se guarda al momento de fijar el precio; cambiar el dólar global
-- ya no reprecifica los paquetes existentes.
-- Los paquetes ya guardados se congelan con el dólar vigente al ejecutar esto.

alter table public.packages add column if not exists tipo_cambio numeric(10,2);

update public.packages
set tipo_cambio = coalesce(
  (select value from public.settings where key = 'cambio_usd_crc'),
  450
)
where tipo_cambio is null;

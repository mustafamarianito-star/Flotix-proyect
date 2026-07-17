# Consultas SQL — Vistas de reporte, índices y rol de lectura

Este archivo contiene **todo el SQL** necesario para exponer los datos a Looker
Studio de forma segura y eficiente. Es **aditivo y reversible**: crea un
esquema nuevo (`reporting`), vistas, índices y un rol de solo lectura. **No
modifica tablas, columnas, políticas RLS ni datos existentes.**

> ▶️ **Cómo aplicarlo**: pegá los bloques en **Supabase → SQL Editor** y ejecutá,
> en el orden 1 → 2 → 3 → 4. O pedile a Claude que lo aplique por vos vía MCP
> (es el mismo SQL). El bloque 4 (contraseña del rol) **lo tenés que correr vos**
> para que la contraseña nunca pase por el código ni por el chat.

Mapeo de nombres: tu pedido mencionaba `vw_ventas / vw_clientes / vw_productos /
vw_estadisticas` como ejemplo. Como esta app es de **flota/combustible** (no de
ventas), las vistas se nombran según el dominio real y equivalen así:

| Ejemplo del pedido | Vista real en este proyecto |
|---|---|
| `vw_ventas` | `reporting.vw_rendiciones` + `reporting.vw_ingresos_mensuales` |
| `vw_clientes` | `reporting.vw_choferes` |
| `vw_productos` | `reporting.vw_vehiculos` |
| `vw_estadisticas` | `reporting.vw_estadisticas` |

---

## Bloque 1 — Índices (rendimiento)

Aceleran las agregaciones por fecha/mes, chofer, estado y vehículo. Benefician
tanto a las vistas de reporte como a las consultas de la propia app.
`if not exists` los hace seguros de re-ejecutar.

```sql
-- Combustible: se consulta por fecha, por tipo de movimiento y por vehículo.
create index if not exists idx_fuel_movements_date        on public.fuel_movements (date);
create index if not exists idx_fuel_movements_kind        on public.fuel_movements (movement_kind);
create index if not exists idx_fuel_movements_vehicle     on public.fuel_movements (vehicle);

-- Rendiciones: dashboard por mes (period_start), por chofer, estado y vehículo.
create index if not exists idx_rendiciones_period_start   on public.rendiciones (period_start);
create index if not exists idx_rendiciones_driver_id      on public.rendiciones (driver_id);
create index if not exists idx_rendiciones_status         on public.rendiciones (status);
create index if not exists idx_rendiciones_vehicle_label  on public.rendiciones (vehicle_label);
```

---

## Bloque 2 — Esquema y vistas de reporte

El esquema `reporting` mantiene las vistas **fuera de `public`**, así la Data API
(PostgREST) no las expone y la app no se entera de nada. Las vistas son
propiedad de `postgres`, por lo que leen las tablas base sin chocar con RLS; el
rol `looker_ro` solo verá estas vistas ya agregadas.

```sql
create schema if not exists reporting;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Vehículos (equivale a "vw_productos")
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_vehiculos as
select
  v.id,
  v.label            as vehiculo,
  v.plate            as patente,
  v.brand            as marca,
  v.model            as modelo,
  v.year             as anio,
  v.type             as tipo,
  v.status           as estado,
  v.insurance_expiry as vto_seguro,
  v.vtv_expiry       as vto_vtv,
  case when v.insurance_expiry is null then null
       else (v.insurance_expiry - current_date) end as dias_para_seguro,
  case when v.vtv_expiry       is null then null
       else (v.vtv_expiry       - current_date) end as dias_para_vtv,
  v.created_at       as creado_en
from public.vehicles v;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Choferes (equivale a "vw_clientes")
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_choferes as
select
  d.id,
  d.name           as chofer,
  d.license        as licencia,
  d.phone          as telefono,
  d.license_expiry as vto_licencia,
  case when d.license_expiry is null then null
       else (d.license_expiry - current_date) end as dias_para_licencia,
  (select count(*) from public.rendiciones r where r.driver_id = d.id) as total_viajes,
  d.created_at     as creado_en
from public.drivers d;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Combustible (movimientos enriquecidos con importe y mes)
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_combustible as
select
  f.id,
  f.date                                            as fecha,
  to_char(f.date, 'YYYY-MM')                        as mes,
  extract(year from f.date)::int                    as anio,
  f.vehicle                                         as vehiculo,
  f.type                                            as tipo_combustible,
  f.movement_kind                                   as tipo_movimiento,
  f.liters                                          as litros,
  f.price_per_liter                                 as precio_litro,
  round((f.liters * f.price_per_liter)::numeric, 2) as importe,
  case when f.movement_kind = 'carga'   then f.liters else 0 end as litros_carga,
  case when f.movement_kind = 'consumo' then f.liters else 0 end as litros_consumo,
  f.notes                                           as notas,
  f.created_at                                      as creado_en
from public.fuel_movements f;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Rendiciones aplanadas (gastos extra sumados desde el jsonb)
--    (equivale a "vw_ventas" a nivel detalle)
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_rendiciones as
select
  r.id,
  r.vehicle_label                        as vehiculo,
  r.driver_id,
  d.name                                 as chofer,
  r.period_start                         as periodo_inicio,
  r.period_end                           as periodo_fin,
  to_char(r.period_start, 'YYYY-MM')     as mes,
  extract(year from r.period_start)::int as anio,
  r.status                               as estado,
  coalesce(r.income, 0)                  as ingreso,
  coalesce((
    select sum((e->>'amount')::numeric)
    from jsonb_array_elements(r.extra_expenses) e
  ), 0)                                  as gastos_extra,
  coalesce(jsonb_array_length(r.incidents), 0)   as cant_incidentes,
  coalesce(jsonb_array_length(r.attachments), 0) as cant_adjuntos,
  r.odometer_start                       as odometro_inicio,
  r.odometer_end                         as odometro_fin,
  case when r.odometer_end is not null and r.odometer_start is not null
       then r.odometer_end - r.odometer_start end as km_recorridos,
  r.notes                                as notas,
  r.created_at                           as creado_en
from public.rendiciones r
left join public.drivers d on d.id = r.driver_id;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Ingresos mensuales (serie del gráfico del dashboard)
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_ingresos_mensuales as
select
  to_char(r.period_start, 'YYYY-MM') as mes,
  min(r.period_start)                as mes_fecha,
  sum(coalesce(r.income, 0))         as ingresos,
  count(*)                           as viajes
from public.rendiciones r
group by to_char(r.period_start, 'YYYY-MM');

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Viajes por vehículo por mes
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_viajes_por_vehiculo as
select
  to_char(r.period_start, 'YYYY-MM') as mes,
  r.vehicle_label                    as vehiculo,
  count(*)                           as viajes,
  sum(coalesce(r.income, 0))         as ingresos
from public.rendiciones r
group by to_char(r.period_start, 'YYYY-MM'), r.vehicle_label;

-- ─────────────────────────────────────────────────────────────────────────
-- 7) Viajes por chofer por mes
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_viajes_por_chofer as
select
  to_char(r.period_start, 'YYYY-MM') as mes,
  coalesce(d.name, 'Sin chofer')     as chofer,
  count(*)                           as viajes,
  sum(coalesce(r.income, 0))         as ingresos
from public.rendiciones r
left join public.drivers d on d.id = r.driver_id
group by to_char(r.period_start, 'YYYY-MM'), coalesce(d.name, 'Sin chofer');

-- ─────────────────────────────────────────────────────────────────────────
-- 8) Dashboard mensual — P&L (réplica EXACTA de los KPIs de la app)
--    ingresos, gasto combustible, gastos extra, resultado, litros, viajes
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_dashboard_mensual as
with meses as (
  select to_char(period_start, 'YYYY-MM') as mes from public.rendiciones
  union
  select to_char(date, 'YYYY-MM')         as mes from public.fuel_movements
),
ingresos as (
  select
    to_char(period_start, 'YYYY-MM') as mes,
    sum(coalesce(income, 0))         as ingresos,
    count(*)                         as viajes,
    sum(coalesce((
      select sum((e->>'amount')::numeric)
      from jsonb_array_elements(extra_expenses) e), 0)) as gastos_extra
  from public.rendiciones
  group by 1
),
combustible as (
  select
    to_char(date, 'YYYY-MM') as mes,
    sum(case when movement_kind = 'carga' then liters * price_per_liter else 0 end) as gasto_combustible,
    sum(case when movement_kind = 'carga' then liters else 0 end)                   as litros_cargados
  from public.fuel_movements
  group by 1
)
select
  m.mes,
  to_date(m.mes || '-01', 'YYYY-MM-DD')                                as mes_fecha,
  coalesce(i.ingresos, 0)                                              as ingresos,
  coalesce(c.gasto_combustible, 0)                                     as gasto_combustible,
  coalesce(i.gastos_extra, 0)                                          as gastos_extra,
  coalesce(c.gasto_combustible, 0) + coalesce(i.gastos_extra, 0)       as gastos_totales,
  coalesce(i.ingresos, 0)
    - (coalesce(c.gasto_combustible, 0) + coalesce(i.gastos_extra, 0)) as resultado,
  coalesce(c.litros_cargados, 0)                                       as litros_cargados,
  coalesce(i.viajes, 0)                                                as viajes
from meses m
left join ingresos    i on i.mes = m.mes
left join combustible c on c.mes = m.mes;

-- ─────────────────────────────────────────────────────────────────────────
-- 9) Vencimientos unificados (seguro, VTV, licencia) — ventana 30 días
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_vencimientos as
select
  tipo,
  referencia,
  fecha_vto,
  (fecha_vto - current_date) as dias_restantes,
  case
    when fecha_vto < current_date              then 'vencido'
    when fecha_vto - current_date <= 30        then 'proximo'
    else 'ok'
  end as estado
from (
  select 'Seguro'   as tipo, v.label as referencia, v.insurance_expiry as fecha_vto
    from public.vehicles v where v.insurance_expiry is not null
  union all
  select 'VTV',      v.label,        v.vtv_expiry
    from public.vehicles v where v.vtv_expiry is not null
  union all
  select 'Licencia', d.name,         d.license_expiry
    from public.drivers d  where d.license_expiry is not null
) x;

-- ─────────────────────────────────────────────────────────────────────────
-- 10) Estadísticas globales (una sola fila, para "scorecards")
-- ─────────────────────────────────────────────────────────────────────────
create or replace view reporting.vw_estadisticas as
select
  (select count(*) from public.vehicles)                        as total_vehiculos,
  (select count(*) from public.vehicles where status = 'activo') as vehiculos_activos,
  (select count(*) from public.drivers)                         as total_choferes,
  (select count(*) from public.rendiciones)                     as total_rendiciones,
  (select coalesce(sum(income), 0) from public.rendiciones)     as ingresos_totales,
  (select coalesce(sum(liters * price_per_liter), 0)
     from public.fuel_movements where movement_kind = 'carga')  as gasto_combustible_total,
  (select coalesce(sum(liters), 0)
     from public.fuel_movements where movement_kind = 'carga')  as litros_cargados_total;
```

---

## Bloque 3 — Rol de solo lectura y permisos

Crea el rol `looker_ro` **sin contraseña** (queda inactivo hasta que le asignes
una en el Bloque 4) y le da permiso de **solo lectura** exclusivamente sobre el
esquema `reporting`. Nunca ve las tablas base ni puede escribir.

```sql
-- Crear el rol si no existe (login, sin herencia de otros roles).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'looker_ro') then
    create role looker_ro with login noinherit;
  end if;
end $$;

-- Solo lectura sobre el esquema reporting.
grant usage  on schema reporting to looker_ro;
grant select on all tables in schema reporting to looker_ro;

-- Que las vistas futuras que se creen en reporting también sean legibles.
alter default privileges in schema reporting grant select on tables to looker_ro;

-- Defensa en profundidad: asegurar que NO tenga acceso a las tablas de public.
revoke all on all tables in schema public from looker_ro;
revoke all on schema public from looker_ro;
```

---

## Bloque 4 — Contraseña del rol (EJECUTAR VOS, no en el código)

Elegí una contraseña fuerte y corré esto **una vez** en el SQL Editor. **No la
guardes en el repositorio ni en `environment.ts`**; va directo en el conector de
Looker Studio.

```sql
alter role looker_ro with password 'PONÉ-UNA-CONTRASEÑA-FUERTE-ACÁ';
```

> Generá una contraseña aleatoria larga (ej. 32+ caracteres). Si alguna vez se
> filtra, basta con volver a correr este `ALTER ROLE` con una nueva y actualizar
> el conector en Looker — el resto del sistema no se toca.

---

## Verificación rápida

```sql
-- ¿Se crearon las 10 vistas?
select table_name from information_schema.views
where table_schema = 'reporting' order by table_name;

-- Probar una vista clave (debería devolver un P&L por mes):
select * from reporting.vw_dashboard_mensual order by mes;

-- Confirmar permisos del rol (debería listar SELECT sobre reporting.*):
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'looker_ro';
```

---

## Cómo revertir (rollback)

Todo es aditivo; para deshacerlo por completo:

```sql
drop schema if exists reporting cascade;   -- borra todas las vistas vw_*
drop role   if exists looker_ro;           -- borra el rol de lectura
-- Los índices son inofensivos, pero si querés quitarlos:
drop index if exists public.idx_fuel_movements_date;
drop index if exists public.idx_fuel_movements_kind;
drop index if exists public.idx_fuel_movements_vehicle;
drop index if exists public.idx_rendiciones_period_start;
drop index if exists public.idx_rendiciones_driver_id;
drop index if exists public.idx_rendiciones_status;
drop index if exists public.idx_rendiciones_vehicle_label;
```

## Notas de seguridad (SQL Injection y buenas prácticas)

- **Looker Studio parametriza** sus consultas contra el conector PostgreSQL; no
  se construyen strings SQL a mano, por lo que no hay superficie de inyección
  desde los dashboards.
- El rol `looker_ro` es de **solo `SELECT`**: aunque alguien obtuviera sus
  credenciales, no puede modificar ni borrar datos, ni leer las tablas base.
- Si en el futuro agregás una API REST (ver `API-Dashboard.md`), usá **siempre
  consultas parametrizadas / prepared statements** (nunca concatenar strings).
- Las vistas usan `to_char`, `coalesce` y agregaciones estándar; ninguna ejecuta
  SQL dinámico.

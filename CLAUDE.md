# Plan de migración a Supabase — Combustible CRM (Transporte Mustamac)

Este archivo resume el plan que definimos con Claude (chat) para migrar la
app de `localStorage` a una base de datos compartida en **Supabase**.
Todavía no se implementó nada de esto en el código — es el plan a ejecutar.

## Por qué migramos

Hoy todos los datos (combustible, vehículos, choferes, rendiciones) viven
en el `localStorage` del navegador de cada usuario — no se comparten entre
dispositivos ni personas. Se decidió migrar a Supabase (Postgres + Auth +
Storage) para tener una base de datos real y compartida.

## Por qué Supabase (vs. Firebase u otra opción)

- Free tier incluye **1 GB de almacenamiento de archivos sin pedir tarjeta
  de crédito** — clave porque la app necesita guardar fotos de facturas.
- Firebase, en cambio, sacó el Storage gratis de su plan Spark; ahora
  requiere activar el plan de pago (Blaze) aunque sea para poca cosa.
- Contras a tener en cuenta: el proyecto gratuito de Supabase se **pausa
  automáticamente tras 7 días sin uso** (se reactiva con un clic, pero
  puede fallar justo en el momento en que alguien lo necesita). Sin
  backups automáticos en el plan free (mitigado porque la app ya tiene un
  export/import manual de datos en `/configuracion`).

## Cálculo de capacidad (1 GB de storage)

- Una foto de factura sin comprimir ronda 1-3 MB → **~300-500 facturas**
  antes de llenar el 1 GB gratis.
- Con ~20 rendiciones/mes x 2-3 facturas c/u, el límite se alcanzaría en
  6-12 meses.
- **Mitigación pendiente de implementar**: comprimir las imágenes en el
  navegador antes de subirlas (bajar de ~3 MB a 300-500 KB) — estira la
  capacidad 5-6x. Hacerlo desde el arranque de la migración, no después.
- Cuando se llene igual: salto a Supabase Pro (u$s 25/mes, 100 GB).

## Alcance de la migración (qué hay que tocar)

Los 4 servicios de datos ya están escritos con una interfaz consistente
pensada justo para este momento (`all`, `getById`, `create`, `update`,
`delete`), así que la migración es principalmente reescribir el *adentro*
de estos archivos para hablar con Supabase en vez de `localStorage`, sin
tener que tocar los componentes/pantallas:

- `src/app/features/fuel/fuel.service.ts`
- `src/app/features/vehicles/vehicle.service.ts`
- `src/app/features/drivers/driver.service.ts`
- `src/app/features/rendiciones/rendicion.service.ts`

También hay que migrar:
- **Auth** (`src/app/core/auth/auth.service.ts`): hoy decodifica el JWT de
  Google Identity Services en el cliente. Pasaría a usar
  `supabase.auth.signInWithOAuth({ provider: 'google' })`, lo que requiere
  configurar el proveedor de Google **dentro de Supabase** (Client ID +
  Client Secret de Google Cloud Console, y agregar la URL de callback de
  Supabase a los "Authorized redirect URIs" de esa credencial de Google).
  El login demo (fallback actual cuando no hay Client ID configurado) deja
  de tener sentido una vez migrado — con RLS activado, un usuario demo
  falso no podría leer/escribir nada real.
- **Adjuntos de facturas** (hoy base64 en localStorage, dentro de
  `rendicion-form.component.ts` / `rendicion.model.ts`): pasan a subirse
  al bucket de Supabase Storage `facturas`, guardando la URL pública (o
  firmada) en vez del base64.
- **Backup/restore** (`src/app/features/config/`): hoy lee/escribe
  `localStorage` directo. Debería reescribirse para exportar leyendo los
  signals `.all()` de cada servicio (que ya van a estar poblados desde
  Supabase), y para restaurar reinsertando vía los métodos `create()` de
  cada servicio en vez de `localStorage.setItem` directo.

## Esquema de base de datos propuesto (SQL, sin ejecutar todavía)

Nota de diseño: `extra_expenses`, `incidents` y `attachments` de cada
rendición se guardan como columnas `jsonb` dentro de la misma fila de
`rendiciones` (no como tablas separadas) — simplifica mucho las queries
para este volumen de datos, ya que siempre se leen/escriben como parte de
la rendición completa. `fuel_movements` sí queda como tabla normal porque
se consulta pesado (por vehículo, por rango de fechas, para el dashboard).

```sql
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  plate text not null,
  brand text not null,
  model text not null,
  year int,
  type text not null,
  status text not null default 'activo',
  insurance_expiry date,
  vtv_expiry date,
  created_at timestamptz not null default now()
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license text,
  phone text,
  license_expiry date,
  created_at timestamptz not null default now()
);

create table fuel_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  liters numeric not null,
  type text not null, -- 'nafta' | 'diesel'
  price_per_liter numeric not null,
  movement_kind text not null, -- 'carga' | 'consumo'
  vehicle text, -- vehicle label (texto libre, igual que hoy)
  notes text,
  created_at timestamptz not null default now()
);

create table rendiciones (
  id uuid primary key default gen_random_uuid(),
  vehicle_label text not null,
  driver_id uuid references drivers(id) on delete set null,
  period_start date not null,
  period_end date not null,
  status text not null default 'pendiente', -- 'pendiente' | 'aprobada' | 'pagada'
  income numeric, -- monto facturado / ingreso del viaje (alimenta el dashboard)
  odometer_start numeric,
  odometer_end numeric,
  extra_expenses jsonb not null default '[]'::jsonb,
  incidents jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- RLS: cualquier usuario autenticado tiene acceso completo (no hay roles
-- todavía; es una decisión consciente para no sumar otro sistema grande
-- en esta misma migración).
alter table vehicles enable row level security;
alter table drivers enable row level security;
alter table fuel_movements enable row level security;
alter table rendiciones enable row level security;

create policy "authenticated full access" on vehicles
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on drivers
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on fuel_movements
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on rendiciones
  for all to authenticated using (true) with check (true);

-- IMPORTANTE (cambio de Supabase de 2026): desde el 30/05/2026 los
-- proyectos nuevos ya NO exponen automáticamente las tablas nuevas a la
-- Data API (PostgREST/supabase-js) — hay que otorgar permisos explícitos:
grant usage on schema public to authenticated;
grant select, insert, update, delete on vehicles, drivers, fuel_movements, rendiciones to authenticated;

-- Políticas del bucket de Storage "facturas" (crear el bucket a mano
-- desde el dashboard antes de correr esto):
create policy "authenticated upload facturas" on storage.objects
  for insert to authenticated with check (bucket_id = 'facturas');
create policy "authenticated read facturas" on storage.objects
  for select to authenticated using (bucket_id = 'facturas');
create policy "authenticated delete facturas" on storage.objects
  for delete to authenticated using (bucket_id = 'facturas');
```

## Cambios de esquema posteriores (migraciones)

Si ya corriste el SQL de arriba antes de estos cambios, aplicá los ALTER que
falten en el SQL Editor de Supabase:

```sql
-- Ingresos por rendición (dashboard de ingresos mensuales / resultado).
-- La columna queda cubierta por el grant a nivel tabla ya existente.
alter table rendiciones add column if not exists income numeric;
```

## Pasos pendientes (checklist)

- [x] Crear proyecto en Supabase (el usuario ya está en esto).
- [x] Correr el SQL de arriba en el SQL Editor de Supabase.
- [x] Crear el bucket de Storage `facturas` (vía SQL — `insert into
      storage.buckets`, bucket privado, con sus políticas ya creadas).
- [x] Configurar el proveedor de Google en Supabase Auth (Client ID +
      Client Secret + redirect URI en Google Cloud Console). Resuelto: el
      error "Unable to exchange external code" era el Client Secret; se
      regeneró en Google Cloud Console y se pegó de nuevo en Supabase.
- [x] Agregar `@supabase/supabase-js` a `package.json`.
- [x] Crear `src/app/core/supabase/supabase.client.ts` con `createClient`.
- [x] Agregar `supabaseUrl` / `supabaseAnonKey` a
      `src/environments/environment.ts` y `environment.development.ts`.
- [x] Reescribir `AuthService` para usar `supabase.auth` + Google OAuth.
- [x] Reescribir los 4 servicios de datos para leer/escribir en Supabase
      (mismo patrón: signal local + métodos async que pegan a Supabase).
- [x] Actualizar los componentes que llaman a esos servicios para usar
      `async`/`await` en `save()`/`remove()`/cambios de estado.
- [x] Migrar adjuntos de facturas de base64 a Supabase Storage (bucket
      `facturas`, URLs firmadas para descarga/preview).
- [x] Agregar compresión de imágenes en el navegador antes de subir
      facturas (para estirar el 1 GB gratis) — `shared/util/compress-image.ts`.
- [x] Adaptar el backup/restore de `/configuracion` a la nueva fuente de
      datos (export lee `.all()` de cada servicio, import reinserta vía
      `create()` — es aditivo, no reemplaza).
- [x] Actualizar el `README.md` del proyecto con las nuevas instrucciones.

## Datos que el usuario todavía tiene que conseguir/pegar

- ~~Project URL de Supabase~~ — ya pegada en `environment.ts` / `environment.development.ts`.
- ~~Anon/publishable key de Supabase~~ — ídem.
- **Client Secret de la credencial de Google** (Google Cloud Console →
  Credenciales → mismo Client ID que ya se usa) — esto sigue pendiente:
  hay que pegarlo en Supabase (Authentication → Providers → Google), no en
  el código de la app.

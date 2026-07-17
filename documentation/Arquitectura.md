# Arquitectura — Flotix / Combustible CRM

> Documento de referencia del estado **actual** del proyecto y de cómo se
> integra Google Looker Studio. No describe un diseño futuro: refleja lo que
> hay hoy en el código y en la base de datos.

## 1. Vista general

Flotix es una aplicación de **gestión de flota** (combustible, vehículos,
choferes, rendiciones e ingresos). Es una **SPA de Angular** que se conecta
**directamente** a **Supabase** (PostgreSQL + Auth + Storage). **No existe un
backend propio** (ni Node, ni Express, ni Nest): el navegador habla con
Supabase mediante el SDK `@supabase/supabase-js`, que por debajo usa la Data
API de Supabase (PostgREST) y GoTrue para autenticación.

```
┌──────────────────────┐        HTTPS (SDK supabase-js)      ┌───────────────────────┐
│   Angular 18 (SPA)   │  ─────────────────────────────────▶ │       Supabase        │
│  standalone+signals  │      PostgREST / GoTrue / Storage    │  ┌─────────────────┐  │
│  Angular Material    │ ◀───────────────────────────────────│  │ PostgreSQL      │  │
└──────────┬───────────┘                                      │  │ (public schema) │  │
           │                                                  │  └─────────────────┘  │
           │ Google OAuth                                     │  Auth (Google OAuth)  │
           ▼                                                  │  Storage (facturas)   │
   Usuario autenticado                                        └───────────┬───────────┘
                                                                          │ conexión Postgres
                                                             SSL + rol looker_ro (solo lectura)
                                                                          ▼
                                                              ┌───────────────────────┐
                                                              │  Google Looker Studio │
                                                              │  (conector PostgreSQL)│
                                                              │  lee esquema reporting│
                                                              └───────────────────────┘
```

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Angular 18 (componentes standalone, signals, `computed`) |
| UI | Angular Material 18 |
| Lenguaje | TypeScript 5.5 |
| Datos / Auth / Storage | Supabase (PostgreSQL, GoTrue, Storage) |
| SDK de datos | `@supabase/supabase-js` ^2.110 |
| Export a Excel | `exceljs` |
| BI / Reportes | **Google Looker Studio** (conector nativo PostgreSQL) — *integración de este trabajo* |

## 3. Estructura del código (frontend)

```
src/app/
├─ core/
│  ├─ auth/              auth.service.ts   → Supabase Auth + Google OAuth
│  ├─ supabase/          supabase.client.ts → createClient(url, anonKey)
│  ├─ interceptors/      manejo de errores/sesión
│  ├─ chart-scale/       preferencia de zoom de gráficos
│  └─ theme/             tema claro/oscuro
├─ features/
│  ├─ dashboard/         KPIs mensuales + gráficos (fuente de verdad de los reportes)
│  ├─ fuel/              cargas/consumos de combustible
│  ├─ vehicles/          alta/baja/edición de flota
│  ├─ drivers/           choferes
│  ├─ rendiciones/       rendiciones de viajes (ingresos, gastos extra, adjuntos)
│  ├─ config/            backup/restore
│  └─ login/
└─ shared/
   ├─ expiry/            expiry.service.ts → vencimientos (ventana 30 días)
   ├─ mini-chart/        gráficos SVG del dashboard
   └─ util/              compresión de imágenes, etc.
```

Los 4 servicios de datos (`fuel.service.ts`, `vehicle.service.ts`,
`driver.service.ts`, `rendicion.service.ts`) comparten una interfaz consistente
(`all`, `getById`, `create`, `update`, `delete`) y mantienen un `signal` local
sincronizado con Supabase.

## 4. Modelo de datos (PostgreSQL — esquema `public`)

| Tabla | Filas* | Descripción |
|---|---|---|
| `vehicles` | 3 | Flota: patente, marca, modelo, tipo, estado, vencimientos (seguro/VTV) |
| `drivers` | 3 | Choferes: nombre, licencia, teléfono, vencimiento de licencia |
| `fuel_movements` | 1 | Cargas y consumos de combustible (litros, precio/litro, tipo) |
| `rendiciones` | 4 | Rendiciones de viaje: ingreso, gastos extra (`jsonb`), incidentes (`jsonb`), adjuntos (`jsonb`), odómetro, estado |

\* Conteos al momento de escribir este documento; crecen con el uso.

Relaciones:

- `rendiciones.driver_id → drivers.id` (FK, `on delete set null`).
- `rendiciones.vehicle_label` y `fuel_movements.vehicle` referencian al
  **texto** `vehicles.label` (no es FK; es texto libre, igual que en la app).

Detalle de diseño relevante para reportes: `extra_expenses`, `incidents` y
`attachments` viven como arreglos `jsonb` **dentro** de la fila de
`rendiciones`. Para reportar sobre gastos extra hay que "desarmar" ese `jsonb`
(ver `Consultas-SQL.md`). Estructura de cada elemento:

- `extra_expenses[]`: `{ id, date, amount, description }`
- `incidents[]`: `{ id, date, severity, description }`
- `attachments[]`: `{ … url/nombre del archivo en Storage }`

## 5. Lógica de negocio que los reportes deben respetar

Estos son los cálculos que hace el dashboard de la app (`dashboard.component.ts`
y los servicios). Las **vistas SQL de reporte replican exactamente esta
semántica** para que Looker muestre los mismos números que la app:

| KPI | Definición exacta |
|---|---|
| Mes de una rendición | mes de `period_start` (no de `created_at`) |
| Mes de un movimiento de combustible | mes de `date` |
| Ingresos del mes | `Σ rendiciones.income` del mes |
| Gastos extra del mes | `Σ` de `amount` de cada `extra_expenses` de las rendiciones del mes |
| Gasto en combustible del mes | `Σ (liters × price_per_liter)` **solo** de `movement_kind = 'carga'` |
| Litros cargados del mes | `Σ liters` **solo** de `movement_kind = 'carga'` |
| Gastos totales del mes | gasto combustible + gastos extra |
| Resultado del mes | ingresos − gastos totales |
| Viajes del mes | cantidad de rendiciones del mes |
| Balance de litros | cargas suman, consumos restan |
| Vencimiento "próximo" | vence dentro de **30 días** (`WARNING_WINDOW_DAYS`) |
| Vencimiento "vencido" | fecha `< hoy` |

## 6. Integración con Looker Studio (resumen)

- **Conexión**: directa a PostgreSQL de Supabase mediante el **Session Pooler**
  (IPv4, SSL obligatorio). No se usa la API REST porque no es necesaria.
- **Seguridad**: rol de base de datos **`looker_ro`** con permiso `SELECT`
  **únicamente** sobre el esquema `reporting`. No puede leer las tablas base ni
  escribir nada. La contraseña la define el dueño del proyecto; **nunca se
  guarda en el código**.
- **Datos expuestos**: un esquema separado `reporting` con vistas (`vw_*`) que
  pre-agregan la información. Al vivir fuera de `public`, estas vistas **no** se
  exponen por la Data API (PostgREST) → no cambian nada de la app ni su
  superficie pública.

Ver `Integracion-Looker-Studio.md` para el paso a paso y `Consultas-SQL.md`
para el detalle de las vistas e índices.

## 7. Qué NO se modifica

- Ningún archivo de código Angular existente.
- Ninguna tabla, columna, política RLS ni dato de `public`.
- La conexión actual de la app (se **reutiliza** la misma base; no se crea otra).

Todo lo nuevo es **aditivo** (esquema `reporting`, vistas, índices, rol de
lectura) y reversible.

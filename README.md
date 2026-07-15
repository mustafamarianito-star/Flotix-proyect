<div align="center">

<img src="src/assets/flotix-app-icon-square.svg" alt="Flotix" width="88" height="88" />

# Flotix

**Gestión de flota para empresas de transporte** — combustible, vehículos, choferes, rendiciones e ingresos, en una base compartida y en tiempo real.

[![Angular](https://img.shields.io/badge/Angular-18-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth%20%2B%20Storage-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Material](https://img.shields.io/badge/Angular%20Material-18-757575?logo=materialdesign&logoColor=white)](https://material.angular.io)

</div>

---

## Índice

- [¿Qué es Flotix?](#qué-es-flotix)
- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Puesta en marcha](#puesta-en-marcha)
  - [1. Requisitos previos](#1-requisitos-previos)
  - [2. Instalación](#2-instalación)
  - [3. Crear y configurar el proyecto de Supabase](#3-crear-y-configurar-el-proyecto-de-supabase)
  - [4. Configurar el login con Google](#4-configurar-el-login-con-google)
  - [5. Correr en desarrollo](#5-correr-en-desarrollo)
  - [6. Build de producción](#6-build-de-producción)
- [Scripts disponibles](#scripts-disponibles)
- [Modelo de datos](#modelo-de-datos)
- [Backup y restauración](#backup-y-restauración)
- [Roadmap](#roadmap)
- [Licencia](#licencia)

---

## ¿Qué es Flotix?

Flotix reemplaza las planillas sueltas y el `localStorage` de cada navegador
por una base de datos real y compartida en **Supabase**, protegida con login
de Google. Todo el equipo (administración, choferes, dueños) ve la misma
información actualizada en el momento, desde cualquier dispositivo.

## Características

**📊 Dashboard**
- KPIs del mes: ingresos, gastos, resultado (ganancia/pérdida), viajes y litros cargados.
- Gráfico de ingresos mensuales (últimos 6 meses) y de viajes por camión / por chofer.
- Navegador de historial por mes (◀ ▶) para revisar períodos anteriores.
- Zoom manual sobre los gráficos, con la preferencia guardada por dispositivo.
- Alertas de vencimientos próximos (seguro, VTV, licencias de conducir).

**⛽ Combustible**
- Registro de cargas y consumos de nafta/diésel, con balance de litros en vivo.

**🚚 Vehículos y 👤 Choferes**
- Alta, baja y edición de la flota (patente, marca, modelo, tipo, estado, vencimientos).
- Alta rápida de choferes, con licencia y vencimiento.

**🧾 Rendiciones**
- Por vehículo + chofer + período: calcula automáticamente el gasto en combustible del tramo.
- Ingreso facturado del viaje (alimenta el dashboard), gastos extra (peajes, viáticos, reparaciones) y siniestros.
- Facturas adjuntas (fotos o PDF), comprimidas en el navegador y subidas a Supabase Storage.
- Exportación a Excel de una rendición o de todas juntas.

**⚙️ General**
- Login con Google vía Supabase Auth (sin contraseñas propias).
- Tema claro/oscuro, elegible desde Preferencias.
- Backup y restauración de todos los datos en un archivo `.json`.
- Diseño responsive (mobile / tablet / desktop).

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | [Angular 18](https://angular.dev) (standalone components, signals) + [Angular Material](https://material.angular.io) |
| Backend | [Supabase](https://supabase.com) — Postgres, Auth (Google OAuth), Storage |
| Lenguaje | TypeScript |
| Gráficos | SVG propio (`shared/mini-chart`), sin librerías externas |
| Exportación | [ExcelJS](https://github.com/exceljs/exceljs) |

## Estructura del proyecto

```
src/app/
  core/
    auth/            → AuthService (Supabase Auth + Google OAuth) y route guard
    supabase/         → Cliente de Supabase (createClient)
    theme/             → ThemeService (tema claro/oscuro, persistido en localStorage)
    chart-scale/       → ChartScaleService (zoom de gráficos, persistido en localStorage)
  shared/
    mini-chart/        → Gráfico SVG reutilizable (barras/líneas)
    expiry/             → Cálculo de vencimientos próximos (seguro, VTV, licencias)
    util/compress-image.ts → Compresión de fotos en el navegador antes de subirlas
  features/
    login/              → Pantalla de inicio de sesión (Google vía Supabase)
    dashboard/          → KPIs, gráficos e historial mensual
    config/              → Preferencias (tema) y backup/restore de datos
    fuel/                 → Cargas y consumos de combustible
    vehicles/              → Alta/baja/edición de la flota
    drivers/                → Alta/baja de choferes
    rendiciones/              → Rendiciones de viaje (gastos, ingresos, siniestros, adjuntos, Excel)
```

## Puesta en marcha

### 1. Requisitos previos

- [Node.js](https://nodejs.org) 18 o superior
- Una cuenta de [Supabase](https://supabase.com) (el free tier alcanza para empezar)
- Un proyecto en [Google Cloud Console](https://console.cloud.google.com) con credenciales OAuth

### 2. Instalación

```bash
git clone https://github.com/mustafamarianito-star/Flotix-proyect.git
cd Flotix-proyect
npm install
```

### 3. Crear y configurar el proyecto de Supabase

1. Creá un proyecto nuevo en [supabase.com](https://supabase.com).
2. Abrí el **SQL Editor** y corré el script de `CLAUDE.md` (sección
   "Esquema de base de datos propuesto"): crea las tablas `vehicles`,
   `drivers`, `fuel_movements` y `rendiciones`, habilita RLS con políticas de
   acceso para usuarios autenticados, otorga los grants necesarios y crea el
   bucket de Storage `facturas` con sus políticas.
3. Si el proyecto ya existía antes de que se agregara el ingreso por viaje,
   corré también la migración indicada en `CLAUDE.md` (`alter table
   rendiciones add column if not exists income numeric;`).
4. Copiá el **Project URL** y la **anon/publishable key** (*Project
   Settings → API*) a `src/environments/environment.ts` y
   `environment.development.ts`:

   ```ts
   supabaseUrl: 'https://tu-proyecto.supabase.co',
   supabaseAnonKey: 'tu-anon-key',
   ```

> ⚠️ El proyecto gratuito de Supabase se pausa automáticamente tras 7 días
> sin uso (se reactiva con un clic desde el dashboard) y no tiene backups
> automáticos — usá `/configuracion` para exportar un respaldo periódicamente.

### 4. Configurar el login con Google

1. En [Google Cloud Console](https://console.cloud.google.com/): creá o
   seleccioná un proyecto.
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: configurala
   (tipo "Externo" sirve para pruebas).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de
   OAuth 2.0**, tipo **Aplicación web**.
4. En **Orígenes de JavaScript autorizados**, agregá `http://localhost:4200`
   (y tu dominio de producción cuando lo tengas).
5. En **URI de redirección autorizados**, agregá la URL de callback de
   Supabase: `https://<tu-proyecto>.supabase.co/auth/v1/callback`.
6. Volvé a Supabase → **Authentication → Providers → Google**: activalo y
   pegá ahí el **Client ID** y el **Client Secret** de esa credencial (no van
   en el código de esta app).

Sin el proveedor de Google configurado en Supabase, el botón de login va a
fallar — no hay modo demo (con RLS activado, un usuario demo no podría
leer/escribir nada real).

### 5. Correr en desarrollo

```bash
npm start
```

Abrí [http://localhost:4200](http://localhost:4200).

### 6. Build de producción

```bash
npm run build
```

Los archivos quedan en `dist/combustible-crm/`.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm start` | Levanta el servidor de desarrollo (`ng serve`) |
| `npm run build` | Build de producción optimizado |
| `npm run watch` | Build en modo desarrollo con recompilación automática |

## Modelo de datos

Los datos viven en 4 tablas de Postgres (esquema completo en `CLAUDE.md`):

- **`vehicles`** — flota: patente, marca, modelo, tipo, estado, vencimientos.
- **`drivers`** — choferes: nombre, licencia, teléfono, vencimiento.
- **`fuel_movements`** — cargas y consumos de combustible.
- **`rendiciones`** — un viaje por fila: vehículo, chofer, período, ingreso,
  gastos extra, siniestros y adjuntos (estos tres últimos como columnas
  `jsonb`, ya que siempre se leen/escriben junto con la rendición completa).

Todas las tablas tienen **Row Level Security** habilitada: cualquier usuario
autenticado tiene acceso completo de lectura/escritura (no hay roles
diferenciados todavía).

Los 4 servicios de datos (`VehicleService`, `DriverService`, `FuelService`,
`RendicionService`) comparten la misma interfaz (`all`, `getById`, `create`,
`update`, `delete`) y hablan directo con Supabase vía `@supabase/supabase-js`.

## Backup y restauración

`/configuracion` permite descargar un `.json` con todos los datos
(vehículos, choferes, combustible, rendiciones — sin las fotos de facturas,
que quedan en Storage) y restaurarlo más adelante. La restauración es
**aditiva**: reinserta cada registro sin borrar lo existente. Los choferes
se recrean con id nuevo, así que las rendiciones importadas remapean
automáticamente su `driverId`.

## Roadmap

- [ ] Bot de WhatsApp + IA: recibir audios y registrar movimientos de
      combustible automáticamente (transcripción + interpretación del
      mensaje, insertando directo en `fuel_movements` vía service role key).
- [ ] Roles de usuario (hoy cualquier autenticado tiene acceso completo).

## Licencia

Proyecto de uso privado para Flotix / Transporte Mustamac. Todos los
derechos reservados.

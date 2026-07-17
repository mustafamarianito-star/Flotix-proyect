# Integración con Google Looker Studio — Paso a paso

Guía para conectar **Google Looker Studio** (ex Data Studio) a la base
**PostgreSQL de Supabase** de Flotix, usando el **conector nativo de
PostgreSQL** y el rol de solo lectura `looker_ro`.

---

## 0. Requisitos previos (una sola vez)

1. Haber ejecutado el SQL de `Consultas-SQL.md` (esquema `reporting`, vistas,
   índices y rol `looker_ro`), incluida la contraseña del **Bloque 4**.
2. Tener una cuenta de Google para entrar a <https://lookerstudio.google.com>.
3. Tener a mano los datos de conexión (siguiente sección).

---

## 1. Obtener los parámetros de conexión

Looker Studio corre en la nube de Google, así que necesita un endpoint
**público con IPv4**. Supabase lo ofrece a través del **Session Pooler**
(Supavisor), que además soporta el tipo de sesión que necesita una herramienta
de BI. **No uses** la conexión "directa" `db.<ref>.supabase.co` (es solo IPv6 y
Looker no la alcanza) ni el "Transaction Pooler" (puerto 6543, no apto para BI).

### Dónde copiar el host exacto

En el **Dashboard de Supabase** → botón **Connect** (arriba a la derecha) →
pestaña **Session pooler**. Vas a ver algo como:

```
postgresql://postgres.jtrkbybaxjkujdxkniza:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

De ahí salen todos los parámetros. Reemplazá el usuario `postgres` por
`looker_ro` (el rol de solo lectura que creaste).

### Tabla de parámetros para Looker

| Campo en Looker | Valor | Notas |
|---|---|---|
| **Host** | `aws-0-<region>.pooler.supabase.com` | Copiá el host tal cual del Session pooler. `<region>` es la de tu proyecto |
| **Port** | `5432` | Session pooler (IPv4). **No** 6543 |
| **Database** | `postgres` | Nombre fijo de la base en Supabase |
| **Username** | `looker_ro.jtrkbybaxjkujdxkniza` | Formato del pooler: `<rol>.<project_ref>` |
| **Password** | *(la del Bloque 4)* | La que definiste con `ALTER ROLE looker_ro …` |
| **Enable SSL** | ✅ Sí (obligatorio) | Supabase exige SSL |

> El `project_ref` de este proyecto es **`jtrkbybaxjkujdxkniza`**
> (URL de la API: `https://jtrkbybaxjkujdxkniza.supabase.co`).

### Certificado SSL (recomendado)

Para verificación SSL completa: Dashboard de Supabase → **Project Settings** →
**Database** → **SSL Configuration** → **Download certificate**
(`prod-ca-2021.crt`). En Looker, al habilitar SSL, subí ese archivo como
**"Server CA certificate"**. Si preferís solo cifrado sin verificar la CA,
alcanza con tildar **Enable SSL** sin subir certificado.

---

## 2. Crear la fuente de datos en Looker Studio

1. Entrá a <https://lookerstudio.google.com> → **Create** → **Data source**.
2. En el buscador de conectores, elegí **PostgreSQL** (conector de Google).
3. Elegí **Database connection** con la opción **"BASIC"** (host/puerto) — no
   uses "Connection URL" para poder cargar el certificado y el SSL con claridad.
4. Completá los campos con la tabla de la sección 1.
5. Tildá **Enable SSL** y, si lo descargaste, subí el certificado de CA.
6. Click en **AUTHENTICATE**. Si los datos están bien, se habilita el panel de
   la derecha para elegir la tabla.

### Elegir qué exponer

Con el rol `looker_ro` **solo verás el esquema `reporting`**. Para cada
dashboard, seleccioná la vista que necesites:

- **CUSTOM QUERY** (recomendado): pegá, por ejemplo,
  `SELECT * FROM reporting.vw_dashboard_mensual ORDER BY mes;`
- o bien elegí directamente la **tabla/vista** `reporting.vw_...` del listado.

7. Click **CONNECT** (arriba a la derecha). Looker te muestra los **campos**
   detectados. Revisá tipos: que `mes_fecha`/`fecha`/`vto_*` figuren como
   **Date**, y los importes/litros como **Number**. Ajustá si hace falta.
8. Click **CREATE REPORT** (o "Add to report").

---

## 3. Vistas disponibles y para qué sirve cada una

| Vista (`reporting.`) | Úsala para… |
|---|---|
| `vw_dashboard_mensual` | Tarjetas de KPIs y series por mes: ingresos, gastos, **resultado**, litros, viajes (réplica exacta del dashboard de la app) |
| `vw_ingresos_mensuales` | Gráfico de línea/barras de ingresos por mes |
| `vw_viajes_por_vehiculo` | Barras de viajes/ingresos por camión |
| `vw_viajes_por_chofer` | Barras de viajes/ingresos por chofer |
| `vw_combustible` | Tabla/serie de cargas y consumos, litros e importe |
| `vw_rendiciones` | Tabla detalle de rendiciones (ingreso, gastos extra, km, estado) |
| `vw_vehiculos` | Tabla de flota + días para vencimiento de seguro/VTV |
| `vw_choferes` | Tabla de choferes + días para vencimiento de licencia + total de viajes |
| `vw_vencimientos` | Semáforo de vencimientos (vencido / próximo ≤30 días / ok) |
| `vw_estadisticas` | Scorecards globales (totales de flota, ingresos, combustible) |

> Cada vista suele ir en **su propia fuente de datos** de Looker (una por
> `CUSTOM QUERY`). Podés reutilizar la misma conexión PostgreSQL para todas.

---

## 4. Construir el dashboard (ejemplo)

Un tablero de "Resumen de flota" típico:

1. **Fila de scorecards** (fuente `vw_estadisticas` o `vw_dashboard_mensual`):
   - Ingresos totales, Gasto combustible, Resultado del mes, Viajes.
   - Insertá **Scorecard** → elegí la métrica → formato moneda / número.
2. **Serie temporal de ingresos** (fuente `vw_ingresos_mensuales`):
   - **Time series** o **Bar chart**; dimensión `mes_fecha`, métrica `ingresos`.
3. **Resultado mensual** (fuente `vw_dashboard_mensual`):
   - **Combo chart**: barras `ingresos` y `gastos_totales`, línea `resultado`.
4. **Viajes por camión / por chofer** (`vw_viajes_por_vehiculo` /
   `vw_viajes_por_chofer`): **Bar chart** dimensión `vehiculo`/`chofer`,
   métrica `viajes`.
5. **Vencimientos** (`vw_vencimientos`): **Table** con formato condicional por
   `estado` (rojo = vencido, ámbar = próximo).
6. **Control de fecha**: agregá un **Date range control** apuntado a `mes_fecha`
   / `fecha` para filtrar todo el tablero por período.
7. **Filtros**: agregá **Drop-down list** por `vehiculo`, `chofer` o `estado`
   para segmentar (cumple el requisito de filtros).

Guardá y usá **Share** para dar acceso de lectura a quien corresponda.

---

## 5. Actualización de datos ("tiempo real")

Looker Studio **cachea** los datos; no es streaming en vivo. Ajustes:

- **Data freshness**: en la fuente de datos → menú **⋮** → **Data freshness** →
  bajalo a **15 minutos** (mínimo) para máxima frescura.
- Botón **Refresh data** en el reporte para forzar una recarga inmediata.

Es, en la práctica, **casi en tiempo real** (hasta 15 min de retraso). Si
necesitás segundos exactos, Looker no es la herramienta adecuada (ninguna
integración de BI lo es).

---

## 6. Advertencias importantes (plan Free de Supabase)

- ⚠️ **Pausa por inactividad**: el proyecto gratuito **se pausa tras 7 días sin
  uso**. Pausado, Looker **no puede conectar**. Se reactiva con un clic desde el
  Dashboard; la app en uso normal lo mantiene despierto.
- **Límite de conexiones**: el pooler administra las conexiones; aun así, no
  abras decenas de fuentes de datos simultáneas innecesarias. Reutilizá la misma
  conexión para varias vistas.
- **Costos**: la conexión de lectura no genera costos extra en el plan Free;
  solo suma consumo de cómputo despreciable para este volumen de datos.

---

## 7. Checklist de conexión

- [ ] SQL de `Consultas-SQL.md` ejecutado (bloques 1–3).
- [ ] `ALTER ROLE looker_ro … PASSWORD` ejecutado por vos (bloque 4).
- [ ] Host/puerto/usuario del **Session pooler** copiados del Dashboard.
- [ ] Fuente de datos PostgreSQL creada en Looker con **SSL habilitado**.
- [ ] Autenticación exitosa y vista `reporting.vw_*` seleccionada.
- [ ] Tipos de campo verificados (Date / Number).
- [ ] Dashboard armado con controles de fecha y filtros.
- [ ] Data freshness ajustado a 15 min (si querés máxima frescura).

---

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Connection refused` / timeout | Usaste el host directo (IPv6) o el proyecto está pausado | Usá el **Session pooler** (IPv4, 5432); reactivá el proyecto en el Dashboard |
| `password authentication failed` | Contraseña o usuario mal | Verificá usuario `looker_ro.<project_ref>` y reasigná contraseña con `ALTER ROLE` |
| `permission denied for schema public` | Elegiste una tabla de `public` | Usá solo vistas de `reporting`; `looker_ro` no accede a `public` (es lo esperado) |
| No aparecen las vistas | El rol no tiene `SELECT` | Re-ejecutá el Bloque 3 de `Consultas-SQL.md` |
| SSL error | Falta habilitar SSL o certificado incorrecto | Tildá **Enable SSL**; opcionalmente subí `prod-ca-2021.crt` |
| Datos "viejos" en el tablero | Caché de Looker | Botón **Refresh data** y bajá **Data freshness** a 15 min |

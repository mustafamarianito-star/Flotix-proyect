# API REST de Dashboard — Alternativa opcional (no requerida)

> **Estado: OPCIONAL / no implementada.** La ruta recomendada es la **conexión
> directa** de Looker Studio a PostgreSQL (ver `Integracion-Looker-Studio.md`),
> porque la base ya es Postgres y Looker tiene conector nativo. Esta API solo
> tiene sentido si en el futuro querés exponer los datos a **otro** consumidor
> (una app móvil, un portal público, otra herramienta de BI) o si decidís **no**
> abrir el puerto de Postgres. Para Looker, una API REST **agrega** trabajo:
> requiere además un **Community Connector** en Apps Script para que Looker la
> lea. Por eso, para el objetivo actual, no se construye; se documenta el diseño
> para dejarlo listo.

## 1. Por qué NO es necesaria para Looker

| Criterio | Conexión directa PostgreSQL | API REST + Community Connector |
|---|---|---|
| Componentes nuevos a mantener | 0 (solo vistas SQL) | Backend + conector Apps Script |
| Superficie de ataque | Rol de solo lectura | Endpoint público + auth propia |
| Esfuerzo | Bajo | Alto |
| Soporte nativo en Looker | ✅ Sí | ❌ Requiere conector a medida |

## 2. Diseño recomendado si se implementa

Como la app vive en Supabase, la opción más natural (sin montar ni pagar un
servidor aparte) es una **Supabase Edge Function** (Deno/TypeScript). Usa la
misma base, reutiliza la conexión y se despliega con la CLI de Supabase.

### Contrato de la API

Base: `https://jtrkbybaxjkujdxkniza.functions.supabase.co/dashboard`

| Endpoint | Descripción |
|---|---|
| `GET /dashboard/mensual` | P&L por mes (ingresos, gastos, resultado, litros, viajes) |
| `GET /dashboard/rendiciones` | Detalle paginado de rendiciones |
| `GET /dashboard/combustible` | Movimientos de combustible paginados |
| `GET /dashboard/vencimientos` | Vencimientos con estado |
| `GET /dashboard/estadisticas` | Totales globales |

Requisitos cubiertos (según el pedido):

- **Autenticación**: header `Authorization: Bearer <API_KEY>` (una API key
  propia guardada como *secret* de la Edge Function, **nunca** en el código).
- **Paginación**: `?page=1&pageSize=50` (máx. 200).
- **Filtros**: `?vehiculo=...&chofer=...&estado=...`.
- **Fechas**: `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`.
- **Agregaciones y estadísticas**: los endpoints `/mensual` y `/estadisticas`
  devuelven datos ya agregados (leen las vistas `reporting.vw_*`).
- **Protección SQL Injection**: se usan las vistas + el SDK de Supabase, que
  **parametriza** todas las consultas (nunca se concatenan strings).

### Ejemplo de implementación (Supabase Edge Function)

`supabase/functions/dashboard/index.ts`:

```ts
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Secrets inyectados por Supabase (NUNCA hardcodear):
//   supabase secrets set DASHBOARD_API_KEY=... SERVICE_ROLE_KEY=...
const API_KEY      = Deno.env.get('DASHBOARD_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cliente de servidor: la service_role vive solo en el backend, jamás en el front.
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const clampPageSize = (n: number) => Math.min(Math.max(n, 1), 200);

serve(async (req) => {
  // 1) Autenticación por API key
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${API_KEY}`) {
    return json({ error: 'No autorizado' }, 401);
  }

  const url  = new URL(req.url);
  const path = url.pathname.replace(/^\/dashboard/, '') || '/';

  // 2) Paginación
  const page     = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1);
  const pageSize = clampPageSize(parseInt(url.searchParams.get('pageSize') ?? '50', 10));
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // 3) Fechas y filtros (parametrizados por el SDK → sin inyección)
  const desde    = url.searchParams.get('desde');
  const hasta    = url.searchParams.get('hasta');
  const vehiculo = url.searchParams.get('vehiculo');
  const chofer   = url.searchParams.get('chofer');
  const estado   = url.searchParams.get('estado');

  try {
    switch (path) {
      case '/mensual': {
        const { data, error } = await db
          .schema('reporting').from('vw_dashboard_mensual')
          .select('*').order('mes', { ascending: true });
        if (error) throw error;
        return json({ data });
      }

      case '/estadisticas': {
        const { data, error } = await db
          .schema('reporting').from('vw_estadisticas').select('*').single();
        if (error) throw error;
        return json({ data });
      }

      case '/rendiciones': {
        let q = db.schema('reporting').from('vw_rendiciones')
          .select('*', { count: 'exact' })
          .order('periodo_inicio', { ascending: false })
          .range(from, to);
        if (desde)    q = q.gte('periodo_inicio', desde);
        if (hasta)    q = q.lte('periodo_inicio', hasta);
        if (vehiculo) q = q.eq('vehiculo', vehiculo);
        if (chofer)   q = q.eq('chofer', chofer);
        if (estado)   q = q.eq('estado', estado);
        const { data, count, error } = await q;
        if (error) throw error;
        return json({ data, pagination: { page, pageSize, total: count } });
      }

      case '/combustible': {
        let q = db.schema('reporting').from('vw_combustible')
          .select('*', { count: 'exact' })
          .order('fecha', { ascending: false })
          .range(from, to);
        if (desde)    q = q.gte('fecha', desde);
        if (hasta)    q = q.lte('fecha', hasta);
        if (vehiculo) q = q.eq('vehiculo', vehiculo);
        const { data, count, error } = await q;
        if (error) throw error;
        return json({ data, pagination: { page, pageSize, total: count } });
      }

      case '/vencimientos': {
        let q = db.schema('reporting').from('vw_vencimientos').select('*')
          .order('dias_restantes', { ascending: true });
        if (estado) q = q.eq('estado', estado);
        const { data, error } = await q;
        if (error) throw error;
        return json({ data });
      }

      default:
        return json({ error: 'Ruta no encontrada' }, 404);
    }
  } catch (e) {
    return json({ error: 'Error interno' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Despliegue

```bash
# Requiere la CLI de Supabase y estar logueado (supabase login)
supabase functions new dashboard        # crea el scaffold (si no existe)
# … pegar el index.ts de arriba …
supabase secrets set DASHBOARD_API_KEY="<clave-larga-aleatoria>"
supabase functions deploy dashboard --project-ref jtrkbybaxjkujdxkniza
```

### Ejemplos de uso

```bash
# P&L mensual
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  "https://jtrkbybaxjkujdxkniza.functions.supabase.co/dashboard/mensual"

# Rendiciones filtradas y paginadas
curl -H "Authorization: Bearer $DASHBOARD_API_KEY" \
  "https://jtrkbybaxjkujdxkniza.functions.supabase.co/dashboard/rendiciones?desde=2026-01-01&hasta=2026-07-31&estado=pagada&page=1&pageSize=50"
```

Respuesta típica:

```json
{
  "data": [ { "mes": "2026-07", "ingresos": 1200000, "resultado": 340000, "viajes": 4 } ],
  "pagination": { "page": 1, "pageSize": 50, "total": 12 }
}
```

## 3. Cómo consumirla desde Looker (si se usara)

Looker Studio **no lee REST directamente**: hay que escribir un **Community
Connector** en Google Apps Script que llame a estos endpoints y mapee los
campos. Es bastante más trabajo que la conexión directa a PostgreSQL, y por eso
esta API queda como alternativa documentada, no como la ruta principal.

## 4. Seguridad de la API

- La `service_role key` **solo** vive en los *secrets* de la Edge Function
  (servidor); jamás en el front ni en `environment.ts`.
- Autenticación por `Bearer` API key; rotable con `supabase secrets set`.
- Todas las consultas pasan por el SDK (parametrizadas) o por vistas → sin SQL
  dinámico ni inyección.
- Solo lectura: los endpoints solo hacen `select`.
- Se pueden agregar **rate limiting** y **CORS** restrictivo si se expone
  públicamente.

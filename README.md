# No Te Afanen

Comparador de precios de supermercados en Argentina, con cuentas de usuario reales
y carrito persistente. Construido con Next.js (App Router) + Supabase, pensado para
desplegar en Vercel.

## Qué cambió respecto a la demo

- **Sin CORS roto**: la búsqueda en vivo llama a `/api/productos`, una ruta que corre
  en el servidor y le habla a Precios Claros por atrás. El navegador nunca llama
  directo a la API del gobierno, así que el bloqueo CORS deja de ser un problema.
- **Cuentas reales**: login y registro con email + contraseña vía Supabase Auth.
  El catálogo se puede navegar sin cuenta (modo invitado, con el carrito
  guardado solo en ese dispositivo); la cuenta sirve para que el carrito, el
  ahorro y las alertas te sigan a cualquier celular.
- **Carrito persistente por usuario**: cada carrito se guarda en una tabla de
  Postgres (`carts`) con Row Level Security, así que cada usuario solo puede leer
  y escribir el suyo. Se guarda con un pequeño debounce cada vez que cambiás
  cantidades.
- **Historial de precios**: cada producto que alguien abre queda "seguido"
  (`tracked_products`), y un cron diario (`/api/cron/snapshot-prices`) le
  guarda una foto del precio de ese día (`price_snapshots`) en las 6 cadenas
  con logo propio. Cuando un producto ya tiene 2+ días de historial, la
  ficha muestra un mini-gráfico de evolución. No hace falta elegir de
  antemano qué productos seguir: la lista crece sola con lo que la gente
  busca.
- **Alertas de bajada de precio**: con sesión iniciada, la campanita en la
  ficha de un producto ("avisame si baja") lo guarda en `price_alerts`. El
  mismo cron de historial compara cada corrida contra la anterior y, si
  bajó 3% o más, genera un aviso en `price_drop_notifications` para cada
  usuario que lo esté siguiendo. Los avisos se ven en la campanita del
  header (in-app, no push todavía — push real necesitaría sumar VAPID keys
  o un servicio como OneSignal, ver el service worker ya armado en
  `public/sw.js`).

## Puesta en marcha (10-15 minutos)

### 1. Creá el proyecto en Supabase

1. Andá a [supabase.com](https://supabase.com) → **New project** (el plan free alcanza).
2. Una vez creado, andá a **SQL Editor** → **New query**, pegá el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo. Esto crea la tabla
   `carts` con las políticas de seguridad.
3. Andá a **Project Settings → API** y copiá:
   - `Project URL`
   - `anon public` key

### 2. Configurá las variables de entorno

Copiá `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Completá con los valores de Supabase del paso anterior:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
PRECIOS_CLAROS_API_URL=https://d3e6htiiul5ek9.cloudfront.net/prod/productos
```

El archivo `.env.example` documenta las variables opcionales de administración,
alertas push, cron y Premium. Copiá solo las que vayas a usar y reemplazá los
valores de ejemplo; nunca publiques `SUPABASE_SERVICE_ROLE_KEY` ni
`VAPID_PRIVATE_KEY`.

Para producción, configurá `SUPABASE_SERVICE_ROLE_KEY`: habilita el límite
compartido de las rutas públicas y las funciones administrativas del servidor.
`CRON_SECRET` protege la tarea diaria del historial de precios:

```
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key   # Project Settings → API → "service_role"
CRON_SECRET=elegi-un-string-random-largo
```

### 3. Probalo local

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`. Te va a pedir crear una cuenta — por defecto Supabase
pide confirmar el email antes de dejarte entrar. Si querés saltear eso mientras
probás: en Supabase, **Authentication → Providers → Email**, desactivá
"Confirm email".

### 4. Desplegá en Vercel

1. Subí este proyecto a un repo de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New Project** → importá el repo.
3. En **Environment Variables**, cargá las mismas variables del `.env.local`
   (incluidas `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` si querés historial
   de precios).
4. Deploy. Listo — tenés una URL pública real. El cron diario de
   `vercel.json` (`/api/cron/snapshot-prices`) se activa solo — no hace
   falta nada más. En el plan Hobby de Vercel los cron jobs corren como
   mucho 1 vez por día, que es justo la frecuencia que ya está configurada.

Si preferís Netlify, el proyecto también funciona ahí: mismo paso de variables de
entorno, y Netlify detecta Next.js automáticamente.

## Estructura del proyecto

```
app/
  page.tsx            → página principal (server component, valida sesión)
  login/page.tsx       → login / registro
  api/productos/route.ts → proxy server-side a Precios Claros
  globals.css          → todos los estilos (mismo diseño minimalista de la demo)
components/
  StoreApp.tsx          → orquesta todo el estado del cliente
  Header.tsx, SavingsCard.tsx, SearchBox.tsx, CategoryChips.tsx,
  CategoryProductList.tsx, ProductDetailSheet.tsx, CompareSection.tsx,
  CartSheet.tsx, BarcodeScanner.tsx, SortMenu.tsx, PremiumModal.tsx
lib/
  supabase/client.ts    → cliente de Supabase para el navegador
  supabase/server.ts    → cliente de Supabase para Server Components
  supabase/admin.ts      → cliente con service_role key, SOLO para el cron
  cart.ts               → leer/guardar el carrito en Supabase
  cartStats.ts           → matemática pura de comparación (totales, ganador, etc.)
  liveItems.ts           → tipos y helpers de los productos de Precios Claros
  products.ts            → rubros, colores y los términos de búsqueda del catálogo
                             (+ catalogQueriesFor: cuántas búsquedas por tanda)
  priceHistory.ts        → avisar que se vio un producto + leer su historial
  priceAlerts.ts          → seguir/dejar de seguir un producto + leer avisos (tope free: 5)
  priceSnapshotWorker.ts → lógica del cron: precios, historial y avisos de bajada
  webPush.ts              → manda el push real (VAPID) a las suscripciones de un usuario
  pushSubscription.ts     → lado navegador: pedir permiso, suscribirse/desuscribirse
  premium.ts              → chequea si un usuario es premium + tope de carrito free
  compareLimit.ts         → tope semanal de "Comparar ahora" para free (3/semana)
  shareCard.ts             → arma el PNG de "compartir como tarjeta" (premium)
app/api/track-product/route.ts       → registra un producto para seguir su precio
app/api/cron/snapshot-prices/route.ts → cron diario, protegido con CRON_SECRET
app/api/push/subscribe/route.ts       → guarda la PushSubscription del usuario logueado
app/api/push/unsubscribe/route.ts     → la borra
proxy.ts                 → refresca la sesión en cada request si hay usuario logueado
                             (antes middleware.ts; Next 16 deprecó ese nombre)
supabase/schema.sql       → tablas + políticas de seguridad (carts, savings_log,
                             tracked_products, price_snapshots, push_subscriptions,
                             premium_status, compare_usage)
vercel.json               → agenda del cron diario de historial de precios
public/sw.js              → service worker: instalable + recibe push + abre la app al tocarlo
```

## Push real (avisos al celular con la app cerrada)

Ya está cableado de punta a punta: campanita del header → "Activar avisos
push al celular" pide permiso, suscribe el navegador y guarda la
`PushSubscription` en `push_subscriptions`; el cron de precios
(`priceSnapshotWorker.ts`) le manda el push a cada usuario que vigila un
producto que bajó, usando `lib/webPush.ts`.

Para que funcione en un deploy hace falta:
1. Correr `npx web-push generate-vapid-keys` una vez y guardar las dos claves.
2. Cargar `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY` (misma clave,
   sin y con el prefijo) y `VAPID_PRIVATE_KEY` en las env vars (ver
   `.env.example`).
3. Correr de nuevo `supabase/schema.sql` en el SQL Editor de Supabase (crea
   la tabla `push_subscriptions` y el límite compartido de solicitudes; es
   seguro correrlo de nuevo. Ejecutalo antes de publicar esta versión.

En local (`npm run dev`) el push también funciona, pero solo en `localhost`
— Web Push exige HTTPS salvo esa excepción.

## Free vs. premium

El alta Premium se coordina **por WhatsApp** ($1000/mes — se cambia en
`lib/premiumPricing.ts`). No hay pasarela de pago cableada: la integración
vieja con Mercado Pago se dio de baja y sus rutas de API se borraron.
Diferencias entre free y premium:

| | Free | Premium |
|---|---|---|
| Carrito | hasta 10 productos distintos (`FREE_CART_PRODUCT_LIMIT` en `lib/premium.ts`) | sin límite |
| Comparar precios ("Comparar ahora") | 3 veces por semana (`FREE_COMPARE_LIMIT` en `lib/compareLimit.ts`) | sin límite |
| Alertas de bajada de precio | hasta 5 productos vigilados a la vez (`FREE_ALERT_LIMIT` en `lib/priceAlerts.ts`) | sin límite |
| Compartir carrito | copiar la lista (texto) | + tarjeta/imagen prolija (PNG, `lib/shareCard.ts`) |

Invitados (sin cuenta) cuentan como free en todo lo de arriba, salvo
alertas (piden cuenta).

### Los topes se aplican en la base, no solo en el navegador

Los chequeos que están en los componentes de React corren en la máquina
del usuario, así que alguien con la consola del navegador abierta los
puede saltear. Por eso los mismos topes están además como triggers de
Postgres en `schema.sql` (sección "Los topes free, aplicados en la BASE"):
el servidor rechaza la 6ª alerta, el producto 11 del carrito, y cualquier
intento de bajar a mano el contador de comparaciones.

Ojo con una cosa: los números están escritos en los dos lados (TypeScript
y SQL) porque no hay forma de compartir una constante entre Postgres y la
app. **Si cambiás un tope, cambialo en los dos lugares.**

### Cómo se da de alta el Premium

1. El usuario toca "Quiero Premium" en el modal → se le abre WhatsApp con un
   mensaje ya escrito **que incluye el email de su cuenta**. Ese email es el
   dato clave: `premium_status` se escribe por `user_id`, y el `user_id` lo
   sacás buscando ese email en Supabase → Authentication → Users.
2. Arreglás el pago con la persona por fuera de la app.
3. Cargás la fila en Supabase → SQL Editor (los comandos exactos, con el
   `insert` y el de renovación, están comentados en `supabase/schema.sql`,
   justo arriba de la tabla `premium_status`):

   ```sql
   insert into public.premium_status (user_id, is_premium, since, premium_until)
   values ('<uuid-del-usuario>', true, now(), now() + interval '30 days')
   on conflict (user_id) do update
     set is_premium = true, since = now(),
         premium_until = now() + interval '30 days', updated_at = now();
   ```

4. Listo. La app le muestra "Sos Premium hasta el …" y el dashboard de
   `/admin` te lista a todos los premium activos con cuántos días les quedan
   (los que están a 5 días o menos salen marcados en rojo, para saber a quién
   escribirle).

`premium_until` es la fecha que manda. Si la dejás en `null`, tanto la app
como los triggers de la base cuentan 30 días desde `since` — así un premium
cargado a mano nunca queda activo para siempre por olvido.

**La baja**: el mismo modal tiene "Dar de baja mi Premium", que abre WhatsApp
con el mensaje de baja escrito. La Ley de Defensa del Consumidor pide que la
baja se pueda pedir por el mismo medio que el alta, y acá el alta es por
WhatsApp. Como el Premium no se renueva solo, si no hacés nada la cuenta
vuelve a free sola al llegar a `premium_until`.

Ideas para más adelante: alertas ampliadas (sube/baja/en promo, no solo
baja) para premium por el mismo canal de push que ya existe, y más de 1
lista de compras guardada.

## Qué falta para ir más allá de esto

- **Recuperar contraseña**: Supabase lo soporta out of the box
  (`supabase.auth.resetPasswordForEmail`), no está cableado en el front todavía.
- **Rate limiting**: las rutas públicas usan un límite compartido en Supabase
  cuando está configurada `SUPABASE_SERVICE_ROLE_KEY`; volvé a ejecutar
  `supabase/schema.sql` al publicar una versión que lo actualice.

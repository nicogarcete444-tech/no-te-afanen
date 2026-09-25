-- Corré esto en Supabase: Project -> SQL Editor -> New query -> pegar y ejecutar.
-- Es seguro correrlo más de una vez (no rompe nada si ya existían las tablas
-- o las políticas de antes).

create table if not exists public.carts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '{}'::jsonb,
  -- productos agregados desde la búsqueda en vivo (no están en el catálogo
  -- fijo), guardados acá para poder mostrarlos de nuevo al recargar/cambiar
  -- de celular.
  live_products jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- si la tabla ya existía de una versión anterior sin live_products, esto la
-- agrega sin romper nada (no-op si ya está).
alter table public.carts add column if not exists live_products jsonb not null default '{}'::jsonb;

alter table public.carts enable row level security;

-- cada usuario solo puede leer y escribir su propia fila
drop policy if exists "carts_select_own" on public.carts;
create policy "carts_select_own" on public.carts
  for select using (auth.uid() = user_id);

drop policy if exists "carts_insert_own" on public.carts;
create policy "carts_insert_own" on public.carts
  for insert with check (auth.uid() = user_id);

drop policy if exists "carts_update_own" on public.carts;
create policy "carts_update_own" on public.carts
  for update using (auth.uid() = user_id);

-- Historial de ahorros: cada fila es "un ahorro registrado" (por ejemplo, al
-- confirmar/copiar una lista de compras terminada). Se agrupan por mes en la
-- app para mostrar "ahorraste este mes" y el gráfico de meses anteriores.
create table if not exists public.savings_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null,
  -- Desglose de ese ahorro por rubro, ej: {"Limpieza": 800, "Almacén": 1200}.
  -- Alimenta la torta de "en qué rubro ahorrás más" en "Tus ahorros".
  -- Default '{}' para no romper el insert de código viejo que todavía no
  -- manda esta columna.
  categories jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Si la tabla ya existía de antes (deploys previos a este campo), sumamos
-- la columna sin tocar los datos: los registros viejos quedan con '{}' y
-- simplemente no aportan a la torta, pero siguen sumando al total general.
alter table public.savings_log
  add column if not exists categories jsonb not null default '{}'::jsonb;

create index if not exists savings_log_user_id_created_at_idx
  on public.savings_log (user_id, created_at);

alter table public.savings_log enable row level security;

drop policy if exists "savings_log_select_own" on public.savings_log;
create policy "savings_log_select_own" on public.savings_log
  for select using (auth.uid() = user_id);

drop policy if exists "savings_log_insert_own" on public.savings_log;
create policy "savings_log_insert_own" on public.savings_log
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- Historial de precios (evolución de un producto en el tiempo)
-- ============================================================
--
-- No podemos guardar el historial de TODO el catálogo (Precios Claros no
-- lista productos, solo responde búsquedas puntuales). En cambio, seguimos
-- solo los productos que la gente realmente abrió en la app: cada vez que
-- alguien ve la ficha de un producto, se registra/actualiza en
-- `tracked_products`. Un cron diario (`/api/cron/snapshot-prices`) recorre
-- esa lista y guarda una foto del precio de ese día en `price_snapshots`.
--
-- Ninguna de estas dos tablas tiene datos de usuarios (no hay user_id): es
-- la misma info pública que ya expone Precios Claros, solo que la vamos
-- acumulando día a día en vez de perderla.

create table if not exists public.tracked_products (
  ean text primary key,
  nombre text,
  last_seen_at timestamptz not null default now(),
  last_snapshot_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tracked_products_last_snapshot_idx
  on public.tracked_products (last_snapshot_at);

alter table public.tracked_products enable row level security;

-- Leer no tiene nada de privado ("esto se buscó"), así que sigue abierto a
-- cualquiera. Escribir es otra historia: como la anon key es pública por
-- diseño (viaja en el bundle del navegador), una policy de insert/update
-- "with check (true)" no es una regla de negocio blanda, es una puerta
-- abierta — cualquiera puede pegarle directo a la API REST de Supabase con
-- esa key, sin pasar por /api/track-product ni por su rate limit, e inflar
-- la tabla sin límite (y de paso la cola de trabajo del cron de
-- snapshot-prices, que recorre esta tabla entera).
--
-- Antes había policies "insert_all"/"update_all" para que el cliente
-- (con la anon key) pudiera escribir directo. Se sacaron: ahora la única
-- escritura la hace el propio servidor con la service_role key (que
-- ignora RLS por completo) desde app/api/track-product/route.ts, detrás
-- del rate limit de esa ruta. Sin policy de insert/update para el rol
-- "authenticated" ni "anon", cualquier intento de escribir con la anon key
-- lo corta Postgres mismo, network-level, antes de que le llegue a nadie.
drop policy if exists "tracked_products_select_all" on public.tracked_products;
create policy "tracked_products_select_all" on public.tracked_products
  for select using (true);

drop policy if exists "tracked_products_insert_all" on public.tracked_products;
drop policy if exists "tracked_products_update_all" on public.tracked_products;

create table if not exists public.price_snapshots (
  id bigint generated always as identity primary key,
  ean text not null references public.tracked_products (ean) on delete cascade,
  chain text not null, -- ej "Carrefour", "Coto" (mismo nombre que usa StoreLogo)
  precio numeric not null,
  precio_lista numeric,
  captured_at timestamptz not null default now()
);

create index if not exists price_snapshots_ean_captured_idx
  on public.price_snapshots (ean, captured_at);

-- Falta store_id: acá no hay tabla de sucursales con ID propio, el
-- identificador real de "qué súper" es esta columna (`chain`, texto: "Coto",
-- "Carrefour"...). La indexamos a ella en su lugar.
create index if not exists price_snapshots_chain_idx
  on public.price_snapshots (chain);

alter table public.price_snapshots enable row level security;

-- Lectura pública (es lo mismo que ya es público en Precios Claros, solo
-- que acumulado en el tiempo). La escritura NO tiene policy de insert acá
-- a propósito: solo el cron, que usa la service_role key (y esa key
-- ignora RLS por completo), puede escribir snapshots.
drop policy if exists "price_snapshots_select_all" on public.price_snapshots;
create policy "price_snapshots_select_all" on public.price_snapshots
  for select using (true);

-- ============================================================
-- Alertas de bajada de precio
-- ============================================================
--
-- `price_alerts`: qué productos sigue cada usuario ("seguir precio").
-- `price_drop_notifications`: lo que el cron va generando cuando detecta que
-- el precio de un producto seguido cambió (subió o bajó) respecto a la
-- corrida anterior — `direction` guarda cuál de los dos fue. Se muestran
-- como campanita en el header (in-app) y, si el usuario activó los avisos,
-- también salen como push real al celular (ver push_subscriptions más abajo
-- y lib/webPush.ts). El nombre de la tabla quedó de cuando solo avisaba
-- bajadas; se mantiene para no romper las policies y el cron ya existentes.

create table if not exists public.price_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ean text not null references public.tracked_products (ean) on delete cascade,
  nombre text,
  created_at timestamptz not null default now(),
  unique (user_id, ean)
);

create index if not exists price_alerts_ean_idx on public.price_alerts (ean);

alter table public.price_alerts enable row level security;

drop policy if exists "price_alerts_select_own" on public.price_alerts;
create policy "price_alerts_select_own" on public.price_alerts
  for select using (auth.uid() = user_id);

drop policy if exists "price_alerts_insert_own" on public.price_alerts;
create policy "price_alerts_insert_own" on public.price_alerts
  for insert with check (auth.uid() = user_id);

drop policy if exists "price_alerts_delete_own" on public.price_alerts;
create policy "price_alerts_delete_own" on public.price_alerts
  for delete using (auth.uid() = user_id);

create table if not exists public.price_drop_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ean text not null,
  nombre text,
  old_price numeric not null,
  new_price numeric not null,
  pct_drop integer not null,
  -- 'bajo' o 'subio'. Not null con default 'bajo' para que las filas viejas
  -- (de cuando esta tabla solo existía para bajadas) sigan siendo válidas.
  direction text not null default 'bajo' check (direction in ('bajo', 'subio')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Para bases que ya tenían la tabla creada antes de sumar `direction`
-- (create table if not exists no agrega columnas a una tabla existente).
alter table public.price_drop_notifications
  add column if not exists direction text not null default 'bajo';
alter table public.price_drop_notifications
  drop constraint if exists price_drop_notifications_direction_check;
alter table public.price_drop_notifications
  add constraint price_drop_notifications_direction_check check (direction in ('bajo', 'subio'));

create index if not exists price_drop_notifications_user_created_idx
  on public.price_drop_notifications (user_id, created_at);
create index if not exists price_drop_notifications_ean_idx
  on public.price_drop_notifications (ean);

alter table public.price_drop_notifications enable row level security;

-- Solo lectura y "marcar como leída" (update) propias. La escritura
-- (insert) es exclusiva del cron con la service_role key, igual que con
-- price_snapshots: no hay policy de insert para el usuario final.
drop policy if exists "price_drop_notifications_select_own" on public.price_drop_notifications;
create policy "price_drop_notifications_select_own" on public.price_drop_notifications
  for select using (auth.uid() = user_id);

drop policy if exists "price_drop_notifications_update_own" on public.price_drop_notifications;
create policy "price_drop_notifications_update_own" on public.price_drop_notifications
  for update using (auth.uid() = user_id);

-- ============================================================
-- Push subscriptions (avisos al celular, app cerrada incluida)
-- ============================================================
--
-- Cada `PushSubscription` que el navegador genera (endpoint + claves p256dh
-- y auth) queda guardada acá, atada al usuario. Un mismo usuario puede tener
-- varias filas (un celu, una notebook, etc.) — el cron le manda el push a
-- todas las que tenga. `endpoint` es único porque un mismo endpoint no
-- puede pertenecer a dos usuarios a la vez (evita duplicados si el mismo
-- dispositivo se vuelve a suscribir).

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Update propio: hace falta porque /api/push/subscribe usa upsert por
-- `endpoint` (si el mismo endpoint ya estaba guardado, por ejemplo las
-- claves cambiaron, actualiza la fila en vez de duplicarla).
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- El cron lee/borra con la service_role key, que ignora RLS por completo.

-- ============================================================
-- Premium (free/premium)
-- ============================================================
--
-- El alta es manual, coordinada por WhatsApp: el usuario toca "Quiero
-- Premium", te escribe con su email, y vos cargás la fila acá. No hay
-- checkout automático (el que había con Mercado Pago se dio de baja junto
-- con sus rutas de API).
--
-- No hay policy de insert/update para el usuario final a propósito: si
-- pudiera escribir su propia fila, se podría auto-otorgar premium gratis.
-- Solo el service_role (vos, desde el SQL Editor) puede escribir acá; el
-- usuario solo puede LEER su estado.

create table if not exists public.premium_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_premium boolean not null default false,
  since timestamptz,
  -- Hasta cuándo vale este premium. Es lo que conviene completar siempre al
  -- dar un alta: deja la fecha explícita en vez de depender de una cuenta
  -- implícita de 30 días. Si queda en null, lib/premium.ts (y la función
  -- is_premium_user de más abajo) lo dan por vencido al mes de "since".
  premium_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Por si ya tenías esta tabla creada de antes (sin esta columna):
alter table public.premium_status add column if not exists premium_until timestamptz;

-- Columnas de la vieja integración con Mercado Pago. Se dejan por si tenés
-- filas históricas con datos ahí; ya no las lee ni las escribe nadie. Si
-- querés limpiar del todo, podés borrarlas a mano:
--   alter table public.premium_status drop column if exists mp_preapproval_id;
--   alter table public.premium_status drop column if exists mp_status;

-- Alta manual (el caso normal). Dale un mes de premium a alguien:
--   insert into public.premium_status (user_id, is_premium, since, premium_until)
--   values ('<uuid-del-usuario>', true, now(), now() + interval '30 days')
--   on conflict (user_id) do update
--     set is_premium = true, since = now(),
--         premium_until = now() + interval '30 days', updated_at = now();
--
-- Renovarle otro mes a alguien que ya era premium:
--   update public.premium_status
--     set premium_until = greatest(premium_until, now()) + interval '30 days',
--         is_premium = true, updated_at = now()
--   where user_id = '<uuid-del-usuario>';
--
-- Darlo de baja ya mismo:
--   update public.premium_status
--     set is_premium = false, updated_at = now()
--   where user_id = '<uuid-del-usuario>';
--
-- El UUID sale de Supabase → Authentication → Users (buscá por el email que
-- te pasó por WhatsApp).

alter table public.premium_status enable row level security;

drop policy if exists "premium_status_select_own" on public.premium_status;
create policy "premium_status_select_own" on public.premium_status
  for select using (auth.uid() = user_id);

-- A propósito NO hay policy de insert/update/delete para el usuario: ver
-- nota arriba. El webhook y la ruta de cancelar corren en el server con la
-- service_role key, que ignora RLS igual.

-- ============================================================
-- Segunda ubicación ("comparar 2 ubicaciones a la vez") — DADA DE BAJA
-- ============================================================
--
-- Esta función (guardar una segunda ubicación, ej. "Laburo", para comparar
-- precios ahí contra la ubicación GPS actual) se sacó de la app. Si tu
-- proyecto de Supabase corrió una versión vieja de este schema, la tabla y
-- el trigger de más abajo (enforce_saved_location_premium /
-- saved_locations_premium) van a seguir existiendo pero ya no los usa nada.
-- No hacen daño quedándose ahí, pero si querés limpiarlos del todo:
--
--   drop trigger if exists saved_locations_premium on public.saved_locations;
--   drop function if exists public.enforce_saved_location_premium();
--   drop table if exists public.saved_locations;

-- ============================================================
-- Tope semanal de "Comparar ahora" (free)
-- ============================================================
--
-- Free: 3 comparaciones de carrito por semana (ver FREE_COMPARE_LIMIT en
-- lib/compareLimit.ts). Premium no tiene tope. Cada fila es "cuántas veces
-- ya comparó este usuario en la semana que arranca en week_start" (lunes).
-- Igual que premium_status, el usuario solo puede LEER su fila: la escribe
-- únicamente register_compare_use (ver más abajo).

create table if not exists public.compare_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  count integer not null default 0,
  -- Qué carritos (ver cartSignature en lib/compareLimit.ts) ya se
  -- desbloquearon esta semana. Antes esto vivía en localStorage
  -- (wasAlreadyRevealed/markRevealed): recargar la página no volvía a
  -- cobrar un uso, pero solo en ESE navegador — borrar el localStorage, o
  -- entrar desde otro dispositivo, hacía que se cobrara de nuevo por el
  -- mismo carrito. Guardándolo acá, la garantía es real (server-side) y
  -- vale para la cuenta, no para el navegador.
  revealed_signatures text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Si la tabla ya existía de una versión anterior sin esta columna:
alter table public.compare_usage
  add column if not exists revealed_signatures text[] not null default '{}';

alter table public.compare_usage enable row level security;

drop policy if exists "compare_usage_select_own" on public.compare_usage;
create policy "compare_usage_select_own" on public.compare_usage
  for select using (auth.uid() = user_id);

-- Sin policy de insert/update para el usuario, a propósito. Toda la escritura
-- pasa por register_compare_use (SECURITY DEFINER, más abajo). Antes había
-- policies de insert/update "propias" y eso dejaba un agujero: la función
-- devuelve allowed=true, sin gastar un uso, si la firma del carrito ya está
-- en revealed_signatures — y el usuario podía escribir ESA columna directo con
-- un update (el trigger de abajo solo vigila `count`), cargándose la firma de
-- cualquier carrito y comparando sin límite.
drop policy if exists "compare_usage_insert_own" on public.compare_usage;
drop policy if exists "compare_usage_update_own" on public.compare_usage;

-- ============================================================
-- Los topes free, aplicados en la BASE (no solo en el navegador)
-- ============================================================
--
-- Todo lo de arriba define QUÉ se guarda. Esta sección define los LÍMITES
-- del plan free directamente en Postgres, con triggers. Importa porque los
-- chequeos que están en el código de React corren en la máquina del
-- usuario: alguien con la consola del navegador abierta puede saltearlos.
-- Un trigger, en cambio, corre del lado del servidor y no se puede evitar
-- desde el cliente, con lo cual el tope vale siempre.
--
-- Los números están repetidos acá y en el código TS a propósito (no hay
-- forma de compartir una constante entre Postgres y TypeScript). Si algún
-- día cambiás un tope, cambialo en los DOS lados:
--   carrito       -> FREE_CART_PRODUCT_LIMIT en lib/premium.ts
--   alertas       -> FREE_ALERT_LIMIT        en lib/priceAlerts.ts
--   comparaciones -> FREE_COMPARE_LIMIT      en lib/compareLimit.ts

-- ¿Este usuario es premium AHORA? Se usa en los triggers de abajo.
-- SECURITY DEFINER: corre con los permisos del dueño de la función, así
-- puede leer premium_status sin que el RLS de esa tabla la bloquee.
--
-- Ojo con esta función: tiene que decidir EXACTAMENTE lo mismo que
-- isPremiumStatusActive() en lib/premium.ts. Antes no lo hacía — miraba solo
-- is_premium y se olvidaba del vencimiento — así que un premium cargado a
-- mano vencía en la app al mes pero la base lo seguía tratando como premium
-- para siempre: el usuario veía los topes del plan free en pantalla y los
-- triggers, en cambio, lo dejaban pasar sin límite.
create or replace function public.is_premium_user(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select ps.is_premium
         and coalesce(
               ps.premium_until,
               ps.since + interval '30 days',
               now() + interval '1 day'  -- sin fechas no lo vencemos a ciegas
             ) > now()
      from public.premium_status ps
      where ps.user_id = uid
    ),
    false
  );
$$;

-- --- Tope de alertas (free: 5 productos vigilados a la vez) ---------------
create or replace function public.enforce_alert_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actuales integer;
begin
  if public.is_premium_user(new.user_id) then
    return new;
  end if;

  select count(*) into actuales from public.price_alerts where user_id = new.user_id;

  if actuales >= 5 then
    raise exception 'limite_alertas_free'
      using hint = 'El plan free permite hasta 5 alertas. Sacá una o pasate a premium.';
  end if;

  return new;
end;
$$;

drop trigger if exists price_alerts_limit on public.price_alerts;
create trigger price_alerts_limit
  before insert on public.price_alerts
  for each row execute function public.enforce_alert_limit();

-- --- Tope del carrito (free: 10 productos distintos) ----------------------
-- `items` es un objeto jsonb {id_producto: cantidad}. Contamos las claves
-- con cantidad mayor a 0 (una cantidad en 0 es un producto sacado, no
-- ocupa lugar).
create or replace function public.enforce_cart_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  distintos integer;
begin
  if public.is_premium_user(new.user_id) then
    return new;
  end if;

  select count(*) into distintos
  from jsonb_each_text(coalesce(new.items, '{}'::jsonb)) as kv(k, v)
  where (v ~ '^[0-9]+$') and v::numeric > 0;

  if distintos > 10 then
    raise exception 'limite_carrito_free'
      using hint = 'El plan free permite hasta 10 productos. Sacá alguno o pasate a premium.';
  end if;

  return new;
end;
$$;

drop trigger if exists carts_limit on public.carts;
create trigger carts_limit
  before insert or update on public.carts
  for each row execute function public.enforce_cart_limit();

-- --- Contador de comparaciones a prueba de retoques ------------------------
-- El usuario necesita poder sumar a su propio contador (por eso tiene
-- policy de update), pero eso también le permitiría mandarlo de vuelta a 0
-- y tener comparaciones infinitas. Este trigger deja que el número suba de
-- a uno, y nunca que baje.
create or replace function public.enforce_compare_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.count > 1 then
      raise exception 'contador_comparaciones_invalido';
    end if;
    return new;
  end if;

  if new.count < old.count then
    raise exception 'contador_comparaciones_invalido'
      using hint = 'El contador de comparaciones no puede bajar.';
  end if;

  if new.count > old.count + 1 then
    raise exception 'contador_comparaciones_invalido'
      using hint = 'El contador de comparaciones sube de a una por vez.';
  end if;

  -- tampoco puede mover la semana de una fila ya existente
  if new.week_start <> old.week_start then
    raise exception 'contador_comparaciones_invalido';
  end if;

  return new;
end;
$$;

drop trigger if exists compare_usage_counter on public.compare_usage;
create trigger compare_usage_counter
  before insert or update on public.compare_usage
  for each row execute function public.enforce_compare_counter();

-- ============================================================
-- "Comparar ahora": chequeo Y descuento del tope, atómicos, en el server
-- ============================================================
--
-- El trigger de arriba (enforce_compare_counter) solo evita que el CONTADOR
-- se manipule (bajar, saltar de a más de uno, cambiar de semana en una fila
-- ya existente) — pero nunca impide directamente pasarse de
-- FREE_COMPARE_LIMIT: nada frenaba un insert con week_start='2099-01-01' (o
-- cualquier semana futura inventada), que siempre entra con count=1 sin
-- pisar ninguna fila existente. Con eso, alguien pegándole directo a la API
-- de Supabase (bypaseando por completo el código de React) tenía cupo
-- infinito con solo variar la fecha.
--
-- Esta función es el único lugar que decide "¿te dejo ver el desglose?":
-- lee si es premium, si no lo es intenta sumar un uso SOLO si todavía no
-- llegó al tope, y devuelve `allowed` con el resultado real. `lib/compare
-- Limit.ts` ahora llama a esto (vía supabase.rpc) en vez de hacer un select
-- + upsert desde el cliente en dos pasos sueltos — acá es una sola
-- operación atómica, así que dos pestañas comparando al mismo tiempo no
-- pueden colarse un cuarto uso en la carrera entre el select y el upsert.
-- Tampoco queda NADA de esto del lado del cliente en localStorage: ni el
-- contador de invitado, ni el "ya lo desbloqueaste" — lo único que guarda
-- localStorage ahora es el carrito en sí (lib/cart.ts), no nada relacionado
-- al tope.
--
-- `p_utc_offset_minutes` reemplaza al week_start que antes mandaba el
-- cliente directamente: Postgres no sabe en qué huso horario está la
-- persona, y queremos que la semana corte a SU medianoche local (mismo
-- criterio que getWeekStart() en TS), pero sin dejar que elija la fecha a
-- mano. Se acepta el offset (los -720..+840 minutos que existen de verdad)
-- y la fecha de corte la calcula esta función, no quien llama.
--
-- `p_signature` es cartSignature(selected) del lado de TS: identifica QUÉ
-- carrito se está comparando. Si ese mismo carrito ya se desbloqueó esta
-- semana, se devuelve `allowed: true` sin tocar el contador — así agregar o
-- sacar un producto sigue gastando un uso nuevo (cambia la firma), pero
-- volver a mirar el mismo carrito (recargar la página, entrar desde el
-- celu) no cuesta nada de nuevo.
create or replace function public.register_compare_use(
  p_user_id uuid,
  p_utc_offset_minutes integer default 0,
  p_signature text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 3; -- FREE_COMPARE_LIMIT, ver lib/compareLimit.ts
  v_offset integer := greatest(-720, least(840, coalesce(p_utc_offset_minutes, 0)));
  v_local timestamptz := now() + (v_offset || ' minutes')::interval;
  v_dow integer := extract(dow from v_local)::integer; -- 0 = domingo
  v_week_start date := (v_local - (make_interval(days => case when v_dow = 0 then 6 else v_dow - 1 end)))::date;
  v_existing public.compare_usage;
  v_count integer;
begin
  -- auth.uid() es quien está autenticado de verdad en este pedido (viene del
  -- JWT, no de lo que mande el body) — sin este chequeo, SECURITY DEFINER
  -- le da a esta función permiso para escribir la fila de CUALQUIER user_id,
  -- RLS de compare_usage incluido.
  if p_user_id is null or auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'no_autorizado';
  end if;

  if public.is_premium_user(p_user_id) then
    return jsonb_build_object('allowed', true, 'premium', true, 'count', 0, 'limit', v_limit);
  end if;

  select * into v_existing from public.compare_usage
    where user_id = p_user_id and week_start = v_week_start;

  if v_existing.user_id is not null and p_signature is not null
     and p_signature = any(v_existing.revealed_signatures) then
    return jsonb_build_object('allowed', true, 'premium', false, 'count', v_existing.count, 'limit', v_limit);
  end if;

  insert into public.compare_usage (user_id, week_start, count, revealed_signatures, updated_at)
  values (
    p_user_id, v_week_start, 1,
    case when p_signature is null then '{}'::text[] else array[p_signature] end,
    now()
  )
  on conflict (user_id, week_start) do update
    set count = public.compare_usage.count + 1,
        revealed_signatures = case
          when p_signature is null then public.compare_usage.revealed_signatures
          else public.compare_usage.revealed_signatures || p_signature
        end,
        updated_at = now()
    where public.compare_usage.count < v_limit
  returning count into v_count;

  if v_count is null then
    -- el "where" de arriba no matcheó: ya estaba en el tope. No se tocó la
    -- fila; leemos el valor actual solo para poder devolverlo.
    select count into v_count from public.compare_usage
      where user_id = p_user_id and week_start = v_week_start;
    return jsonb_build_object('allowed', false, 'premium', false, 'count', coalesce(v_count, v_limit), 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'premium', false, 'count', v_count, 'limit', v_limit);
end;
$$;

-- `authenticated` nomás: un invitado sin sesión no tiene auth.uid(), así que
-- ni llegaría a pasar el chequeo de arriba. Antes los invitados tenían su
-- propio tope "de buena fe" en localStorage; se sacó junto con el resto de
-- esa lógica (ver lib/compareLimit.ts) porque no era una cuota real — se
-- reseteaba solo con abrir una ventana de incógnito. Ahora "Comparar ahora"
-- pide cuenta: es la única forma de tener una cuota que valga algo.
grant execute on function public.register_compare_use(uuid, integer, text) to authenticated;


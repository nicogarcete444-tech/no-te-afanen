-- Correcciones de la auditoría. Idempotente: se puede correr más de una vez.

-- ------------------------------------------------------------------
-- Rate limit compartido: ahora mide "costo" (ej. nº de productos de un
-- pedido de imágenes) y no solo cantidad de requests.
-- ------------------------------------------------------------------
drop function if exists public.consume_api_rate_limit(text, integer, integer);

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_max_requests integer,
  p_window_seconds integer default 60,
  p_cost integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_max_requests is null or p_max_requests < 1 or p_max_requests > 10000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600
     or p_cost is null or p_cost < 1 or p_cost > 1000 then
    return false;
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits(key_hash, window_start, hits)
  values (p_key_hash, v_window, p_cost)
  on conflict (key_hash, window_start) do update
    set hits = public.api_rate_limits.hits + p_cost
  returning hits into v_hits;

  -- Limpieza ocasional para que los identificadores temporales no crezcan sin límite.
  if random() < 0.01 then
    delete from public.api_rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max_requests;
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer, integer) to service_role;

-- ------------------------------------------------------------------
-- tracked_products: al llegar al tope (2000) se desaloja el producto más
-- viejo que nadie sigue y que no se vio en 3 días, en vez de rechazar todo
-- (antes, llenar los cupos bloqueaba las alertas nuevas para todos).
-- ------------------------------------------------------------------
create or replace function public.track_product_limited(p_ean text, p_nombre text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  if p_ean is null or p_ean !~ '^\d{4,20}$'
     or (p_nombre is not null and length(p_nombre) > 200) then
    return false;
  end if;

  update public.tracked_products
     set nombre = coalesce(p_nombre, nombre), last_seen_at = now()
   where ean = p_ean;
  if found then return true; end if;

  perform pg_advisory_xact_lock(hashtextextended('tracked-products-cap', 0));
  update public.tracked_products
     set nombre = coalesce(p_nombre, nombre), last_seen_at = now()
   where ean = p_ean;
  if found then return true; end if;

  select count(*) into v_total from public.tracked_products;
  if v_total >= 2000 then
    delete from public.tracked_products
     where ean = (
       select tp.ean
         from public.tracked_products tp
        where not exists (select 1 from public.price_alerts a where a.ean = tp.ean)
          and tp.last_seen_at < now() - interval '3 days'
        order by tp.last_seen_at asc
        limit 1
     );
    if not found then return false; end if;
  end if;

  insert into public.tracked_products(ean, nombre, last_seen_at)
  values (p_ean, p_nombre, now());
  return true;
end;
$$;
revoke all on function public.track_product_limited(text, text) from public, anon, authenticated;
grant execute on function public.track_product_limited(text, text) to service_role;

-- ------------------------------------------------------------------
-- updated_at automático (antes lo mandaba el cliente en carts).
-- ------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists carts_set_updated_at on public.carts;
create trigger carts_set_updated_at
  before insert or update on public.carts
  for each row execute function public.set_updated_at();

drop trigger if exists premium_status_set_updated_at on public.premium_status;
create trigger premium_status_set_updated_at
  before insert or update on public.premium_status
  for each row execute function public.set_updated_at();

drop trigger if exists compare_usage_set_updated_at on public.compare_usage;
create trigger compare_usage_set_updated_at
  before insert or update on public.compare_usage
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- Índices sin uso: nadie filtra price_snapshots solo por cadena, ni
-- price_drop_notifications por ean (el worker consulta price_alerts).
-- ------------------------------------------------------------------
drop index if exists public.price_snapshots_chain_idx;
drop index if exists public.price_drop_notifications_ean_idx;

-- ------------------------------------------------------------------
-- price_drop_notifications: el usuario solo puede marcar como leída
-- (read_at), no reescribir precios ni textos de su propia fila.
-- ------------------------------------------------------------------
revoke update on public.price_drop_notifications from anon, authenticated;
grant update (read_at) on public.price_drop_notifications to authenticated;

-- ------------------------------------------------------------------
-- push_subscriptions: máximo 10 dispositivos por usuario.
-- ------------------------------------------------------------------
create or replace function public.enforce_push_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  -- Un upsert de un endpoint que ya existe no suma un dispositivo nuevo.
  if exists (select 1 from public.push_subscriptions where endpoint = new.endpoint) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('push-sub:' || new.user_id::text, 0));
  select count(*) into v_total from public.push_subscriptions where user_id = new.user_id;
  if v_total >= 10 then
    raise exception 'limite_suscripciones_push';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_limit on public.push_subscriptions;
create trigger push_subscriptions_limit
  before insert on public.push_subscriptions
  for each row execute function public.enforce_push_subscription_limit();

-- ------------------------------------------------------------------
-- savings_log: el usuario puede borrar su propio historial.
-- ------------------------------------------------------------------
drop policy if exists "savings_log_delete_own" on public.savings_log;
create policy "savings_log_delete_own" on public.savings_log
  for delete using (auth.uid() = user_id);

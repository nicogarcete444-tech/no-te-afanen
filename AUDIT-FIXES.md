# Fixes de la auditoría (24/09/2026)

Verificado localmente: `tsc --noEmit` OK, `eslint` 0 errores, `vitest` 14/14, `next build` OK
(el build en el sandbox necesitó mockear Google Fonts por falta de red; en Vercel/CI no).
SQL validado solo por sintaxis (pglast). **No se corrió contra un Postgres real.**

## Qué se cambió

| ID | Cambio |
|---|---|
| S1 | `isAdminUser()` exige `email_confirmed_at`. Usado en `/admin`, server actions y home. |
| S3 | `/api/imagenes` cobra por nº de EAN; `MAX_PROBES_PER_REQUEST` 100 → 30; `IMAGE_STORE_LOOKUP=0` apaga tiendas/ML. |
| S4 | `supabase/config.toml`: política de contraseña en el servidor. |
| S5 | IP solo se confía en Vercel o con `TRUST_PROXY_HEADERS=1`. |
| S6 | `price_drop_notifications`: el usuario solo puede actualizar `read_at`. |
| S7 | `.gitignore`: `.env*` salvo `.env.example`. |
| S8 | Push: hosts exactos (`fcm.googleapis.com`), sin puerto raro, máx. 10 suscripciones por usuario (trigger). |
| D1 | `supabase/migrations/` (baseline + fixes). `schema.sql` queda generado. |
| D2 | `track-product` valida el EAN contra Precios Claros; la RPC desaloja el más viejo sin alertas al llegar a 2000. |
| D3 | `toggleWatch` con `ignoreDuplicates`. |
| D4 | Trigger `set_updated_at` en carts, premium_status, compare_usage. |
| D5 | Se eliminan 2 índices sin uso. |
| D6 | `POST /api/account/delete` + botón "Eliminar mi cuenta"; policy DELETE en `savings_log`. |
| P1 | `proxy.ts` usa `getClaims()` y excluye `/api/`; la home usa `getClaims()` y solo llama `getUser()` si el email es de admin. |
| P2 | Rate limit: Upstash opcional; Postgres como respaldo; lecturas públicas fallan abiertas, escrituras cerradas. |
| P3 | Coordenadas redondeadas a 2 decimales en el server. |
| P6 | `sendPushToUsers`: una consulta de suscripciones + concurrencia acotada. |
| P7 | `vercel.json`: región `gru1`. |
| SC1 | Cola de snapshots: primero productos con alertas; hasta 120 por corrida con presupuesto de 45 s; avisos solo si el snapshot previo tiene ≤3 días. |
| SC2 | User-Agent con tu dominio (antes un repo inexistente) e interruptor de fuentes. **Sigue siendo una API no oficial.** |
| SC3 | vitest + 5 archivos de tests + `.github/workflows/ci.yml`. |
| SC4 | Retención: snapshots 180 d, notificaciones 90 d, productos abandonados 90 d. |
| SC5 | Cron devuelve 500 si falla y avisa a `ALERT_WEBHOOK_URL`. |

## Pasos manuales (no se pueden hacer desde el código)

1. **Aplicar SQL:** `supabase db push`, o pegar `supabase/schema.sql` en el SQL Editor. Hasta entonces `consume_api_rate_limit` no acepta `p_cost` y el rate limit compartido de Postgres falla (por diseño: lecturas abren, escrituras cierran).
2. **Supabase Auth:** confirmar "Confirm email" activo, largo mínimo 8 y requisitos de contraseña (lo mismo que `config.toml`), SMTP propio.
3. **Vercel:** setear `CRON_SECRET`, `ADMIN_EMAILS`, y opcionalmente `UPSTASH_REDIS_REST_*` y `ALERT_WEBHOOK_URL`.
4. **Supabase:** región `sa-east-1` (que coincida con `gru1`), backups/PITR.
5. **Git:** revisar que ningún `.env` haya sido commiteado alguna vez.
6. Si `supabase-js` en tu proyecto no soporta `getClaims()` con tus claves JWT (proyecto con claves simétricas legacy), la llamada cae a `getUser()` sola: funciona igual, solo sin el ahorro.

## Lo que NO se hizo, a propósito

- **P5 (partir `StoreApp.tsx` de 1.700 líneas y `globals.css`):** refactor grande sin tests de UI; el riesgo de romper la app supera el beneficio hoy. Hacerlo con tests de componentes.
- **P4 (nonce CSP vuelve dinámicas las páginas):** trade-off consciente de seguridad.
- **SC2 fondo:** no hay forma de resolverlo en código. Hay que conseguir una fuente oficial o un acuerdo, y revisar términos de uso antes de cobrar Premium.
- **SC5 Sentry:** requiere cuenta/DSN. Se dejó webhook + logs JSON.
- **SC6 cobro automático de Premium:** decisión de producto.
- **Cron más de 1 vez por día:** depende del plan de Vercel (Hobby = 1/día). La cola priorizada mitiga.

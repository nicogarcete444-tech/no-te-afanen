# Cambios de esta tanda (últimos textos de carga → skeleton)

- **`components/StoreApp.tsx`**: quedaban dos lugares con "Cargando productos…" + spinner en el catálogo (el modo normal y el modo rubro recién elegido) — el modo búsqueda en vivo ya usaba `<ListSkeleton>`. Los dos pasan a `<ListSkeleton rows={6} />`. Se sacó `.loading-state`, `.spinner` y `@keyframes spin` de `app/globals.css` por quedar sin uso.
- **Safe-area en barras flotantes**: ya estaba cubierto en las cuatro (`.bottom-nav`, `.cart-limit-toast`, `.shared-cart-banner`, `.pcard-notice`) vía `bottom: calc(Xpx + env(safe-area-inset-bottom))`, y en `.wrap` vía `padding-bottom`. Sumarle además `padding-bottom: env(...)` a alguna de las de `bottom: calc()` DUPLICARÍA el inset (quedaría con más aire del que hace falta) — no se tocó nada ahí. Si hay una barra puntual sin cubrir avisame cuál.

# Cambios de esta tanda (sw.js: network-first para toda la API)

- **`public/sw.js`**: el network-first que antes solo cubría `/api/productos`, `/api/producto` y `/api/sucursales` (hardcodeados) ahora es genérico: cualquier GET a `/api/*` entra, excepto `/api/cron/*` (nunca lo llama el navegador — lo usa Vercel con un secreto en el header — pero queda afuera explícito, no por confiar en "en la práctica"). Cache-first sigue siendo solo para `STATIC_ASSETS` (logos, íconos, manifest). Caché renombrado `nta-api-*` (antes `nta-prices-*`) ya que ahora no es solo de precios.

# Cambios de esta tanda (sacar localStorage de "Comparar ahora")

- **`lib/compareLimit.ts` sin localStorage** (y `supabase/schema.sql`, `components/StoreApp.tsx`): quedaban dos usos de localStorage en el límite freemium: el contador de invitados (`GUEST_COMPARE_KEY`, resetable con solo abrir una ventana de incógnito) y el "ya desbloqueaste este carrito" (`REVEALED_KEY`, que solo valía en ese navegador). Los dos se sacaron.
  - `register_compare_use` (Postgres) ahora también recibe `p_signature` (la firma del carrito) y guarda en `compare_usage.revealed_signatures` qué carritos ya se desbloquearon esa semana — mismo comportamiento de "no cobrar de nuevo al recargar", pero server-side y por cuenta, no por navegador.
  - Sin cuenta, "Comparar ahora" ya no da 3 usos gratis "de buena fe": pide crear cuenta. No había forma honesta de darle una cuota real a alguien sin una sesión que el server pudiera validar.

# Cambios de esta tanda (auditoría de seguridad)

- **"Comparar ahora" validado en el server** (`supabase/schema.sql` — función `register_compare_use` — y `lib/compareLimit.ts`, `components/StoreApp.tsx`): el tope de 3 comparaciones/semana del plan free se chequeaba y sumaba solo en el navegador; nada impedía pegarle directo a la API de Supabase con un `week_start` inventado y tener cupo infinito. Ahora un RPC de Postgres (SECURITY DEFINER, atómico) es quien decide si se puede sumar un uso más, calculando la semana del lado del server a partir del offset horario del cliente (no de una fecha que él mande). El cliente llama a este RPC y solo revela el desglose si contesta `allowed: true`.
- **Cámara del escáner** (`components/BarcodeScanner.tsx`): si se cerraba el escáner mientras `scanner.start()` todavía no había resuelto, `stop()` podía tirar error y la cámara quedaba prendida. Ahora el cierre espera a que `start()` termine antes de pedir `stop()`, y además se apagan a mano los tracks del `<video>` como red de seguridad, pase lo que pase con la librería.
- **PWA / caché** (`public/sw.js`): las rutas de precios (`/api/productos`, `/api/producto`, `/api/sucursales`) ahora tienen estrategia *network first* en el service worker — siempre se prioriza el precio fresco, y solo si falla la red se sirve la última respuesta buena guardada para esa búsqueda puntual. Complementa (no reemplaza) el fallback de catálogo completo que ya vivía en `lib/catalogCache.ts`.
- Cron (`/api/cron/snapshot-prices`) y políticas RLS de Supabase: ya estaban protegidos (secreto en tiempo constante, `enable row level security` en todas las tablas) — se revisaron como parte de esta auditoría y no hicieron falta cambios ahí.

# Cambios de esta tanda (comparación y catálogo según captura)

- **"Dónde conviene hoy"** (`components/CompareSection.tsx`, `components/StoreApp.tsx`, `app/globals.css`): la comparación del carrito por súper subió de abajo de todo a justo arriba del catálogo. Una tarjeta con una fila por súper (logo en cuadradito, nombre, barra, total y "+$X" contra el más barato; el más barato lleva "Más barato" en verde). Título con "Editar" (abre el carrito). Abajo, "Actualizado hoy, 08:40" (hora real del precio más viejo del carrito) y "Qué incluye".
  - **"Qué incluye"** despliega: qué suma la comparación y cuándo un total es "Estimado", quién gana cada producto, el mejor precio por producto, "Actualizar", y los botones **"Copiar lista y sumar a mi ahorro del mes"**, WhatsApp y tarjeta premium. Esos botones antes estaban siempre a la vista debajo de la comparación; ahora viven acá.
  - Con el carrito vacío sigue el aviso de siempre (o el gráfico global si hay datos). Los estados del plan free ("Comparar ahora" / "Ya usaste tus 3 comparaciones") no cambiaron.
  - Se arregló que las barras podían quedar vacías si el desglose se desbloqueaba sin que cambiaran los totales (el ancho ahora va inline con animación CSS).
  - Nombres para mostrar: "Día", "Changomás" (`chainLabel` en `components/StoreLogo.tsx`; también lo usa el hero).
- **Catálogo** (`components/StoreApp.tsx`, `components/CatalogFilters.tsx`, `components/SortMenu.tsx`): "Catálogo" con el contador a la derecha ("1.284 productos", con puntos de miles) y debajo una fila de píldoras: **Todos · Bajaron · un rubro por cada uno que hay cargado · Filtro**.
  - Las píldoras filtran lo que ya está en pantalla, sin pedir nada nuevo. Los rubros redondos de arriba siguen trayendo más productos de cada rubro.
  - **Bajaron** = productos con un descuento activo ahora (los mismos que detecta "Ofertas cerca tuyo", vía `onEansChange`). No mira historial de bajas de precio.
  - **Filtro** es el orden por precio de antes, ahora como última píldora. Su panel es `position: fixed` (la fila scrollea y lo cortaría) y se abre hacia arriba si abajo no entra.
  - Cambiar de rubro o de búsqueda vuelve a "Todos".
- **Tarjeta de producto** (`components/ProductCard.tsx`, `components/CategoryProductList.tsx`, `lib/textCase.ts`): reemplaza las filas por rubro. Foto (o iniciales de la MARCA), nombre, "Marca · presentación", campanita, los 3 súpers más baratos (el primero en verde con "Más barato"), "Ahorrás $X vs [súper más caro]" y "Agregar" / "En tu carrito".
  - Los precios por súper se piden cuando la tarjeta está por entrar en pantalla (IntersectionObserver), máximo 3 pedidos a la vez, y comparten el caché con la ficha y con el feed de ofertas (`fetchStorePriceDetails`). Sin precios por cadena (o sin súpers cerca) muestra "Desde $X en el país", como antes.
  - Lista plana, sin encabezado por rubro (se conserva el orden por rubro).
  - Nombres y marcas en MAYÚSCULAS se pasan a "Tipo Título" (`niceCase`); lo que ya viene en minúsculas no se toca.
  - **Campanita**: sin cuenta muestra un aviso con "Crear cuenta"; con cuenta prende/apaga el seguimiento (mismo tope de 5 alertas del plan free que la ficha).
  - Tocar la tarjeta sigue abriendo la ficha del producto.
- **Ofertas cerca tuyo** (`components/NearbyDealsFeed.tsx`): las iniciales del recuadro son las de la marca ("LS"), como en la captura.
- **CSS**: se sacó el de la lista por rubro (`.cat-section`, `.cat-row*`), el de la comparación vieja (`.comp-*`) y el de `.sort-trigger`, que ya no se usan. Los estilos nuevos (`.dc-*`, `.filter-*`, `.pcard-*`) están al final de `app/globals.css`.

---

# Cambios de esta tanda (rediseño según captura)

- **Campana en el header** (`components/Header.tsx`, `app/globals.css`): ahora se ve también sin cuenta, al lado del ícono de perfil. El punto rojo aparece hasta que el invitado la toca una vez (queda guardado en el celular, clave `nta-bell-seen`). Al tocarla, el invitado ve "Avisos de precio" con un botón para crear cuenta; con cuenta sigue todo igual ("Productos que sigo", avisos push). El contador de no leídos pasó de violeta a rojo.
- **Buscador** (`components/SearchBox.tsx`, `app/globals.css`): placeholder "Buscar leche, yerba, fideos" y el escáner de códigos de barras dentro de un cuadrado violeta suave a la derecha. La caja quedó un poco más alta.
- **Hero con carrito** (`components/SavingsCard.tsx`, `app/globals.css`): más alto, con el título grande en dos renglones: "Hoy conviene" y abajo el nombre del súper **en texto** (antes iba el logo). "Tu canasta de N productos" ya no va en mayúsculas espaciadas. El hero sin carrito no cambió.
- **Nuevo rubro "Carnes"** (`lib/products.ts`, `components/CategoryChips.tsx`): chip con bife en T, entre Almacén y Limpieza. Las búsquedas de carne vacuna, cerdo, pollo, pescados/mariscos, achuras y embutidos frescos (chorizo, morcilla, salchichas…) salen de Frescos y pasan a Carnes; Frescos se queda con fiambres, quesos, pastas frescas y fruta suelta. El reparto se hace por el texto de cada búsqueda (`NO_ES_CARNE` / `ES_CARNE` en `lib/products.ts`). Carnes tiene sus propias 12 búsquedas fijas (`CATALOG_PINNED`) y color propio. En la portada, el producto de muestra "pollo" ahora es de Carnes. Los carritos guardados con categoría "Frescos" no se rompen.
- **Orden de la portada** (`components/StoreApp.tsx`): buscador → aviso de cuenta → hero → **rubros** → **Ofertas cerca tuyo** → catálogo. Antes las ofertas iban arriba de los rubros.
- **"Bajaron esta semana" → "Ofertas cerca tuyo"** (`components/NearbyDealsFeed.tsx`): mismo nombre que ya usaba la política de privacidad. Se sacó el ícono de tendencia que tenía adelante. Tarjetas más anchas (176 px) con la foto (o las iniciales) en un recuadro redondeado adentro de la tarjeta, en vez de pegada a los bordes.

---

# Cambios de esta tanda

- **Hero con carrito** (`components/SavingsCard.tsx`, `components/StoreApp.tsx`, `app/globals.css`): con el carrito vacío queda igual que siempre (ahorro del mes). Apenas hay productos en el carrito pasa a "Hoy conviene [logo del súper]" + cuánto se paga menos que en el súper más caro. Usa el mismo cálculo y el mismo orden que "Comparación por súper" (`estimatedStoreTotals`), así nunca se contradicen. En el plan free, hasta que se toca "Comparar ahora" no muestra el veredicto (es lo que ese botón desbloquea); el botón del hero hace lo mismo que el de la sección de comparación.
- **Ofertas de hoy** (`components/NearbyDealsFeed.tsx`, `app/globals.css`): antes "Ofertas cerca tuyo". Son los descuentos activos ahora (promo más barata que el precio de lista, mínimo 8%), no historial de bajas. Título más grande y el "% OFF" pasa a verde (el rojo es "más caro" en el resto de la app).
- **Cartel de invitado** (`components/Header.tsx`, `components/StoreApp.tsx`, `app/globals.css`): ya no es un globito flotante que tapaba el buscador. Ahora es una franja debajo del header, con "Crear cuenta" y una ×.
- **Título del catálogo**: "Catálogo" y "Resultados" (antes "Catálogo · Precios Claros" se cortaba en el celular). La fuente sigue nombrada en el pie de página.
- **Error de catálogo** (`components/StoreApp.tsx`): un solo mensaje con botón "Reintentar" en vez de dos avisos repetidos.

---

# Cambios de la tanda anterior

- **Hero de la portada** (`components/SavingsCard.tsx`, `app/globals.css`): más bajo y apaisado, esquinas redondeadas, sin el picado de ticket.
- **Rubros**: mientras cargan se ve un círculo girando (no "No encontramos productos"). `components/StoreApp.tsx`, `app/globals.css`.
- **Buscador** (`app/api/productos/route.ts`, `lib/searchFallback.ts`, `lib/searchAliases.ts`, `components/StoreApp.tsx`):
  - pegar el título de una ficha ("MARCA — nombre") ahora encuentra el producto;
  - hasta 80 resultados por búsqueda (páginas de 40);
  - frases y palabras comunes (asado, comida de gatos, papas fritas, pan…) traen toda la línea;
  - palabras de grupo armadas a mano en `lib/searchAliases.ts` (golosinas, verduras, picada, repelentes, jabones, shampoos…). Para agregar una, sumar una línea en `SYNONYMS`.
- **Fotos** (`app/api/imagenes/route.ts`, `lib/productImage.ts`, `proxy.ts`, `app/api/nombre-producto/route.ts`): cadena de fuentes en orden (Open Facts → 4 tiendas VTEX → 4 tiendas VTEX más → MercadoLibre); si una tiene foto no se consulta la siguiente. Se permitieron los dominios de fotos nuevos en la CSP. Se arregló el pedido de foto por nombre, que no mandaba lat/lng.
- **Gráfico de ahorro estilo Mercado Pago** (`components/SavingsHistoryModal.tsx`, `app/globals.css`): barras azules con punta redonda, eje Y con líneas punteadas, mes elegido con línea punteada y globito con monto verde, 12 meses con scroll horizontal, modo oscuro. Colores en `.mp-chart` (`--mp-bar`, `--mp-green`).

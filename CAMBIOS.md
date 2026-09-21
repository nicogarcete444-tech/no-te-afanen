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

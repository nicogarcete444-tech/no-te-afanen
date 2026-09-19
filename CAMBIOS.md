# Cambios de esta tanda

- **Hero de la portada** (`components/SavingsCard.tsx`, `app/globals.css`): más bajo y apaisado, esquinas redondeadas, sin el picado de ticket.
- **Rubros**: mientras cargan se ve un círculo girando (no "No encontramos productos"). `components/StoreApp.tsx`, `app/globals.css`.
- **Buscador** (`app/api/productos/route.ts`, `lib/searchFallback.ts`, `lib/searchAliases.ts`, `components/StoreApp.tsx`):
  - pegar el título de una ficha ("MARCA — nombre") ahora encuentra el producto;
  - hasta 80 resultados por búsqueda (páginas de 40);
  - frases y palabras comunes (asado, comida de gatos, papas fritas, pan…) traen toda la línea;
  - palabras de grupo armadas a mano en `lib/searchAliases.ts` (golosinas, verduras, picada, repelentes, jabones, shampoos…). Para agregar una, sumar una línea en `SYNONYMS`.
- **Fotos** (`app/api/imagenes/route.ts`, `lib/productImage.ts`, `proxy.ts`, `app/api/nombre-producto/route.ts`): cadena de fuentes en orden (Open Facts → 4 tiendas VTEX → 4 tiendas VTEX más → MercadoLibre); si una tiene foto no se consulta la siguiente. Se permitieron los dominios de fotos nuevos en la CSP. Se arregló el pedido de foto por nombre, que no mandaba lat/lng.

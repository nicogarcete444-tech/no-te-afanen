'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { loadCart, saveCart, StoredCart } from '@/lib/cart';
import { createClient } from '@/lib/supabase/client';
import { CartMap, Product } from '@/lib/types';
import {
  CATEGORIES,
  CATALOG_BROWSE_DISABLED,
  CATALOG_RESULTS_PER_QUERY,
  HOME_TEASER_QUERIES,
  HOME_TEASER_LIMIT,
  HOME_TEASER_RESULTS_PER_QUERY,
  catalogPagesFor,
  catalogQueriesFor,
} from '@/lib/products';
import { cartStats, estimatedStoreTotals } from '@/lib/cartStats';
import { formatAge, oldestPricedAt, refreshCartPrices } from '@/lib/cartPrices';
import { getMonthlyHistory, migrateGuestSavingsToAccount } from '@/lib/savingsHistory';
import { FREE_CART_PRODUCT_LIMIT, isPremium } from '@/lib/premium';
import { FREE_COMPARE_LIMIT, cartSignature, getCompareUsage, markRevealed, registerCompareUse, wasAlreadyRevealed } from '@/lib/compareLimit';
import { clearSharedCartFromUrl, readSharedCartFromUrl, SharedCartPayload } from '@/lib/sharedCart';
import { applyTheme, resolveInitialTheme, Theme } from '@/lib/theme';

import Header from './Header';
import SavingsCard from './SavingsCard';
import { extractEan, groupLiveItems, LiveItem, normalizeEan, SortOrder } from '@/lib/liveItems';
import { getProductImageUrl, getProductNameByEan, photoLookupName, resolveSearchableName } from '@/lib/productImage';
import CategoryProductList from './CategoryProductList';
import CatalogFilters from './CatalogFilters';
import { fetchNearbyStores, getProductNameFromPreciosClaros, NearbyStore } from '@/lib/storePrices';
import { formatCacheAge, loadCatalogCache, saveCatalogCache } from '@/lib/catalogCache';
import CompareSection from './CompareSection';
import NearbyDealsFeed from './NearbyDealsFeed';
import Footer from './Footer';
import BottomNav, { BottomNavTab } from './BottomNav';

// Estos cuatro quedan siempre montados en el árbol (controlados por su prop
// `open`, no por un if), así que con un import normal su JS entraba entero
// en el bundle inicial aunque el usuario nunca abra el carrito, el escáner
// o los modales de historial/premium. dynamic() los
// separa en su propio chunk, que recién se pide la primera vez que se
// renderizan — es la mayor parte de los ~115 KiB de "JavaScript que no se
// usa" que marcaba Lighthouse en la carga inicial.
const CartSheet = dynamic(() => import('./CartSheet'));
const BarcodeScanner = dynamic(() => import('./BarcodeScanner'));
const SavingsHistoryModal = dynamic(() => import('./SavingsHistoryModal'));
const PremiumModal = dynamic(() => import('./PremiumModal'));

// Punto fijo en Buenos Aires: se usa como arranque inmediato de `coords` (ver
// más abajo) y como respaldo si el navegador no da ubicación real. La API de
// Precios Claros exige lat/lng sí o sí, así que sin esto no había forma de
// pedir un solo producto sin ubicación.
const BA_FALLBACK = { lat: -34.6037, lng: -58.3816 };

// Distancia aproximada en km entre dos puntos (fórmula haversine, sin
// precisión de más: acá solo hace falta decidir si vale la pena recargar el
// catálogo, no navegar un barco). Se usa para NO recargar todo cuando la
// ubicación real que trae el navegador cae cerca del fallback de Buenos
// Aires (el grueso de las visitas, dado el AMBA): en ese caso los resultados
// iban a salir prácticamente iguales, así que mejor evitar el parpadeo de
// "vuelve a cargar" y quedarse con lo que ya se pintó.
function roughKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// De cada rubro del inicio (ver HOME_TEASER_QUERIES) llegan varios
// candidatos, no uno solo (ver el comentario de HOME_TEASER_RESULTS_PER_QUERY
// en lib/products.ts). Acá elegimos, por rubro, el primero que tenga foto —
// y si ninguno la tiene, recién ahí cae al primero tal cual antes. Todos los
// chequeos de foto se disparan juntos (no rubro por rubro) para que
// getProductImageUrl los agrupe en la menor cantidad posible de pedidos a
// /api/imagenes, y de paso queden en caché para cuando la tarjeta los vuelva
// a pedir.
async function pickHomeTeaserWithPhotos(slots: LiveItem[][]): Promise<LiveItem[]> {
  const perSlot = await Promise.all(
    slots.map(async (candidates) => {
      if (!candidates.length) return null;
      const withPhoto = await Promise.all(
        candidates.map(async (item) => {
          const ean = extractEan(item);
          const url = ean ? await getProductImageUrl(ean, photoLookupName(item)) : null;
          return { item, hasPhoto: !!url };
        })
      );
      const found = withPhoto.find((c) => c.hasPhoto);
      return (found ?? withPhoto[0]).item;
    })
  );
  return perSlot.filter((item): item is LiveItem => !!item);
}

// Esqueleto de carga con la MISMA forma que una fila real de producto
// (foto cuadrada + marca + nombre + precio a la derecha). Antes eran dos
// barras grises genéricas: al llegar los datos la página se reacomodaba
// entera y daba la sensación de que algo se había roto. Con la silueta
// correcta, los productos aparecen "dentro" del hueco que ya estaban
// ocupando.
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="sk-section" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="sk-row" key={i}>
          <div className="sk-media" />
          <div className="sk-text">
            <div className="sk-bar sm" />
            <div className="sk-bar lg" />
            <div className="sk-bar md" />
          </div>
          <div className="sk-price" />
        </div>
      ))}
    </div>
  );
}

// Cuántos productos de un rubro se muestran de entrada al elegirlo en las
// píldoras de la portada, y cuántos se suman cada vez que se toca "Mostrar más".
const RUBRO_PAGE_SIZE = 10;

// "Ofertas cerca tuyo" mira productos de TODOS los rubros, no solo los 10 de la
// portada: de cada rubro se piden las primeras búsquedas (esta cantidad, con
// esta cantidad de resultados cada una) y con eso se buscan promos activas.
const DEALS_QUERIES_PER_RUBRO = 2;
const DEALS_RESULTS_PER_QUERY = 5;

export default function StoreApp({
  userId,
  userEmail,
  isAdmin,
}: {
  userId: string | null;
  userEmail: string | null;
  isAdmin?: boolean;
}) {
  // Si ya cerró el cartel de "creá tu cuenta" en este dispositivo, no lo
  // mostramos de nuevo (a menos que cierre sesión más adelante).
  const [accountBannerDismissed, setAccountBannerDismissed] = useState(false);
  // Carrito que alguien más compartió por link (ver lib/sharedCart.ts): se
  // lee de la URL una sola vez al entrar, y se le ofrece a la persona
  // sumarlo al suyo antes de tocar nada del carrito actual.
  const [sharedCartOffer, setSharedCartOffer] = useState<SharedCartPayload | null>(null);
  const router = useRouter();
  // Arranca en claro solo para el render del servidor; el script inline de
  // app/layout.tsx ya dejó el data-theme correcto en <html> antes del
  // primer pintado, y el efecto de abajo sincroniza este estado con eso.
  const [theme, setTheme] = useState<Theme>('light');
  const [cartLoaded, setCartLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<CartMap>({});
  // Estado premium (alta manual por WhatsApp — ver lib/premium.ts).
  // Invitados y cuentas free comparten el mismo tope de carrito.
  const [premium, setPremium] = useState(false);
  // Mensaje corto que aparece abajo cuando el carrito free llega al tope
  // (o cuando se agotan las comparaciones de la semana). Se limpia solo a
  // los pocos segundos (ver el useEffect que lo agenda).
  const [cartLimitNotice, setCartLimitNotice] = useState<string | null>(null);
  // Cuántas veces ya usó "Comparar ahora" esta semana (free) y si ya
  // desbloqueó el desglose por súper en esta visita a la página. Premium
  // nunca queda bloqueado, así que compareUsage/compareRevealed no se leen
  // para esas cuentas.
  const [compareUsage, setCompareUsage] = useState(0);
  const [compareRevealed, setCompareRevealed] = useState(false);
  // Mientras se vuelven a pedir los precios del carrito antes de comparar.
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  // Productos agregados desde la búsqueda en vivo (no están en el catálogo fijo).
  const [liveProducts, setLiveProducts] = useState<Record<string, Product>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [cartPop, setCartPop] = useState(false);

  // historial de ahorros: se abre desde el menú de cuenta (junto a
  // "Cerrar sesión" / "Legales"). refreshKey fuerza a releer el historial
  // si se registra un ahorro nuevo mientras el modal ya está abierto.
  const [savingsHistoryOpen, setSavingsHistoryOpen] = useState(false);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [savingsRefreshKey, setSavingsRefreshKey] = useState(0);

  // tab activa del nav inferior (solo visual — cada botón dispara su propia
  // acción, "Inicio" y "Carrito" son las únicas que quedan "marcadas" un
  // rato ya que las demás son atajos puntuales).
  const [activeTab, setActiveTab] = useState<BottomNavTab>('inicio');
  const [openAccountSignal, setOpenAccountSignal] = useState(0);

  // Ahorro del mes: viene del historial guardado (confirmaste una lista de
  // compras), NO de lo que tengas puesto en el carrito ahora mismo. Así, si
  // sacás productos del carrito después de comprar, el ahorro ya registrado
  // no se pierde.
  const [monthlySavings, setMonthlySavings] = useState(0);

  // Si venía ahorrando como invitado (sin cuenta) y ahora hay una sesión
  // iniciada, copiamos ese historial a la cuenta antes de leerlo de
  // Supabase — si no, el ahorro guardado en este celu "desaparecía" al
  // loguearse porque la cuenta arrancaba de cero.
  useEffect(() => {
    if (!userId) return;
    migrateGuestSavingsToAccount(userId).then(() => {
      setSavingsRefreshKey((k) => k + 1);
    });
  }, [userId]);

  // Estado premium: invitados y usuarios sin fila en premium_status quedan
  // en free (isPremium ya devuelve false para ambos casos).
  useEffect(() => {
    let cancelled = false;
    isPremium(userId).then((res) => {
      if (!cancelled) setPremium(res);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Cuántas comparaciones ya gastó esta semana (se lee de nuevo al cambiar
  // de usuario, por ej. al loguearse: la cuenta puede traer un contador
  // distinto al que tenía como invitado).
  useEffect(() => {
    let cancelled = false;
    getCompareUsage(userId).then((count) => {
      if (!cancelled) setCompareUsage(count);
    });
    setCompareRevealed(false);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // El avisito de "llegaste al tope" se borra solo, no hace falta que el
  // usuario lo cierre a mano.
  useEffect(() => {
    if (!cartLimitNotice) return;
    const t = setTimeout(() => setCartLimitNotice(null), 3500);
    return () => clearTimeout(t);
  }, [cartLimitNotice]);

  useEffect(() => {
    let cancelled = false;
    getMonthlyHistory(userId, 1).then((months) => {
      if (!cancelled) setMonthlySavings(months[0]?.total || 0);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, savingsRefreshKey]);

  const [liveMode, setLiveMode] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [liveStatus, setLiveStatus] = useState('');

  // Escaneo de código de barras: reutiliza la misma búsqueda en vivo de
  // arriba (se busca el código como si lo hubieras tipeado), pero guardamos
  // el EAN escaneado aparte para poder priorizar el resultado que matchea
  // exacto en vez de mostrar cualquier coincidencia parcial por nombre.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedEan, setScannedEan] = useState<string | null>(null);

  // Orden de los resultados por precio (catálogo y búsqueda en vivo).
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevancia');
  // Fila de filtros de abajo de "Catálogo": 'todos', 'bajaron' o un rubro.
  const [catalogFilter, setCatalogFilter] = useState('todos');
  // Códigos de barra con una oferta activa ahora (los avisa el feed de
  // "Ofertas cerca tuyo"): es lo que muestra el filtro "Bajaron".
  const [dealEans, setDealEans] = useState<Set<string>>(new Set());

  // Vidriera inicial (sin buscar nada): también sale de Precios Claros, no
  // de datos inventados. Se arma con varias búsquedas fijas por rubro.
  const [catalogItems, setCatalogItems] = useState<LiveItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogStatus, setCatalogStatus] = useState('');
  // Sube en 1 cada vez que se toca "Reintentar": vuelve a correr la carga del catálogo.
  const [catalogRetryKey, setCatalogRetryKey] = useState(0);
  // Qué tanda del rubro estamos mostrando. Cada tanda son unas pocas
  // búsquedas (CATALOG_QUERIES_PER_PAGE), no el rubro entero: ver el
  // comentario largo en lib/products.ts sobre por qué.
  const [catalogPage, setCatalogPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Rubro elegido en las píldoras de la portada (ver rubroMode más abajo): la
  // portada trae un solo producto por rubro, así que al elegir uno se piden
  // más de ese rubro. Se guardan por rubro para no volver a pedirlos si el
  // usuario va y vuelve entre píldoras.
  const [rubroItems, setRubroItems] = useState<Record<string, LiveItem[]>>({});
  // Cuántas tandas (de CATALOG_QUERIES_PER_PAGE búsquedas) ya se pidieron de cada rubro.
  const [rubroPages, setRubroPages] = useState<Record<string, number>>({});
  // Rubro que se está pidiendo ahora mismo (null = ninguno).
  const [rubroLoadingCat, setRubroLoadingCat] = useState<string | null>(null);
  // Cuántos productos del rubro se ven (arranca en 10, "Mostrar más" suma 10).
  const [rubroLimit, setRubroLimit] = useState(RUBRO_PAGE_SIZE);
  // Se pide de a una tanda por vez, para no disparar cientos de búsquedas juntas.
  const rubroInFlight = useRef(false);

  // Productos de todos los rubros, intercalados (uno de cada rubro, después otro
  // de cada uno...), de donde salen las "Ofertas cerca tuyo".
  const [dealsSweep, setDealsSweep] = useState<LiveItem[]>([]);

  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [storesStatus, setStoresStatus] = useState('');
  // Arranca en Buenos Aires y NO en null: antes esto se quedaba en null hasta
  // que resolvía navigator.geolocation.getCurrentPosition, y como el efecto
  // de acá abajo que carga el catálogo corta con `if (!coords) return`, la
  // vidriera entera quedaba esperando el cartel de permiso de ubicación —
  // hasta 6 segundos (el timeout de abajo) si el usuario no contestaba
  // rápido, o directamente colgada si el navegador nunca disparaba el
  // callback. Arrancando ya con Buenos Aires, el catálogo pide productos
  // de una, y si después llega una ubicación real, se pisa sola (ver el
  // efecto de geolocalización) y todo lo que depende de `coords` se
  // actualiza solo.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(BA_FALLBACK);

  const searchDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cartPopTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Si entramos desde un link de "carrito compartido" (?carrito=...), lo
  // leemos una sola vez al montar. No lo mezclamos solo ni nada: se le
  // ofrece a la persona en un cartel y decide ella si lo suma.
  useEffect(() => {
    const offer = readSharedCartFromUrl();
    if (offer) setSharedCartOffer(offer);
  }, []);

  // carga el carrito guardado del usuario en Supabase (una sola vez, al
  // montar). Así, si entrás desde otro celu con la misma cuenta, ves el
  // mismo carrito.
  useEffect(() => {
    let cancelled = false;
    loadCart(userId)
      .then((stored) => {
        if (cancelled) return;
        setSelected(stored.items);
        setLiveProducts(stored.liveProducts);
      })
      .catch(() => {
        // Si Supabase no responde (red caída, sesión vencida, lo que sea),
        // no dejamos a la persona mirando "Cargando tu carrito..." para
        // siempre: arrancamos con el carrito vacío en vez de trabarnos.
      })
      .finally(() => {
        if (!cancelled) setCartLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // ya no lo mandamos a /login: se queda navegando como invitado.
    router.refresh();
  }

  // Toma el tema que el script de arranque ya dejó puesto (elección
  // guardada, o claro si nunca eligió). Ya no sigue al sistema operativo en
  // vivo: el default es claro y solo cambia si la persona lo elige a mano
  // con el toggle del header.
  useEffect(() => {
    setTheme(resolveInitialTheme());
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
      return next;
    });
  }

  // header: sombra/blur más marcado al scrollear. passive:true porque el
  // handler no llama a preventDefault — sin eso el navegador tiene que
  // esperar a que termine antes de mover la página, y el scroll se siente
  // pesado justo mientras se recorre el catálogo.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // sucursales cercanas para poder comparar precios reales por cadena en la
  // búsqueda en vivo. `coords` ya arranca en BA_FALLBACK (ver su useState más
  // arriba), así que esto pide las sucursales de Buenos Aires DE UNA, sin
  // esperar el permiso de ubicación. Si el navegador después da una posición
  // real, se pisa sola: nada de lo de arriba se bloquea mientras tanto.
  useEffect(() => {
    function loadStores(lat: number, lng: number, usedFallback: boolean) {
      fetchNearbyStores(lat, lng)
        .then((stores) => {
          setNearbyStores(stores);
          setStoresStatus(
            usedFallback
              ? 'Comparando con súper de Buenos Aires — activá la ubicación para ver los de tu zona.'
              : ''
          );
        })
        .catch(() => setStoresStatus('No se pudo cargar la lista de súper cercanos.'));
    }

    loadStores(BA_FALLBACK.lat, BA_FALLBACK.lng, true);

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const real = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Si la posición real cae cerca del fallback (AMBA, en la práctica
        // el grueso de las visitas), no vale la pena recargar catálogo,
        // sucursales y búsquedas por una diferencia que no va a cambiar
        // resultados — solo el parpadeo de "vuelve a cargar todo". Pero la
        // ubicación SÍ está activa, así que hay que sacar el cartel de
        // "activá la ubicación" (antes se quedaba pegado para siempre en
        // este caso, aunque el permiso ya estaba dado).
        if (roughKm(BA_FALLBACK, real) < 30) {
          setStoresStatus('');
          return;
        }
        setCoords(real);
        loadStores(real.lat, real.lng, false);
      },
      () => {
        // Ya se pintó con el fallback de Buenos Aires; sin permiso no hay
        // nada más que hacer.
      },
      { timeout: 6000 }
    );
  }, []);

  // Al cambiar de rubro se vuelve a la primera tanda.
  useEffect(() => {
    setCatalogPage(0);
  }, [activeCategory]);

  // Vidriera: en "Todos" (portada) se disparan las ~10 búsquedas variadas del
  // teaser. Al elegir un rubro puntual, se disparan las de ESA TANDA del
  // rubro — no las de todo el rubro.
  //
  // Esto último era un problema serio: DEFAULT_CATALOG_QUERIES tiene más de
  // 1700 términos, así que tocar "Almacén" lanzaba 538 pedidos seguidos a
  // /api/productos. La app se bloqueaba a sí misma con su propio rate limit
  // (429), le pegaba a la API pública de Precios Claros como un scraper, y el
  // rubro tardaba muchísimo en terminar de cargar. Ahora cada tanda son 12
  // búsquedas y el resto se pide con "Ver más productos".
  useEffect(() => {
    if (!coords) return;
    // Rubros como Verdulería no arman vidriera automática (ver el comentario
    // en CATALOG_BROWSE_DISABLED): ni pedimos nada ni mostramos "cargando",
    // vamos directo al cartel que invita a buscar o escanear.
    if (CATALOG_BROWSE_DISABLED.includes(activeCategory)) {
      setCatalogItems([]);
      setCatalogLoading(false);
      setLoadingMore(false);
      setCatalogStatus('');
      return;
    }
    const { lat, lng } = coords;
    let cancelled = false;
    const BATCH_SIZE = 6;
    const isHome = activeCategory === 'Todos';
    const queries = isHome ? HOME_TEASER_QUERIES : catalogQueriesFor(activeCategory, catalogPage);
    const resultsPerQuery = isHome ? HOME_TEASER_RESULTS_PER_QUERY : CATALOG_RESULTS_PER_QUERY;
    const isFirstPage = catalogPage === 0;

    if (isFirstPage) {
      setCatalogItems([]);
      setCatalogLoading(true);
      setCatalogStatus('Consultando precios oficiales...');
    } else {
      setLoadingMore(true);
    }

    // Corre una tanda de búsquedas (en sub-lotes de BATCH_SIZE). En modo
    // "Todos" llena homeSlots por índice (se necesita para elegir después
    // el candidato con foto); en un rubro puntual va empujando a `merged` y
    // pintando la pantalla con lo que ya llegó. Separado en función aparte
    // para poder llamarlo una segunda vez (ver "reintento" más abajo) sin
    // duplicar el loop entero.
    async function runBatch(
      qs: { category: string; query: string }[],
      merged: LiveItem[],
      homeSlots: LiveItem[][],
      slotOffset: number
    ) {
      for (let i = 0; i < qs.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = qs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(({ category, query }) =>
            fetch(`/api/productos?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}&limit=${resultsPerQuery}`)
              .then((res) => (res.ok ? res.json() : { productos: [] }))
              .then((data) => (data.productos || []).map((p: LiveItem) => ({ ...p, _cat: category })))
              .catch(() => [] as LiveItem[])
          )
        );
        if (isHome) {
          results.forEach((candidates, j) => {
            homeSlots[slotOffset + i + j] = candidates;
          });
          // Acá no pisamos catalogItems todavía: si mostráramos el primer
          // candidato de cada rubro apenas llega y después lo cambiáramos
          // por el que sí tiene foto, la portada "parpadearía". Se espera a
          // tener todos los candidatos (ver más abajo).
        } else {
          const chunk = results.flat();
          merged.push(...chunk);
          if (!cancelled && chunk.length) {
            // vamos mostrando lo que ya llegó, en vez de tapar todo hasta el final
            setCatalogItems((prev) => [...prev, ...chunk]);
            // Solo se baja el "cargando" cuando ya hay algo para mostrar.
            setCatalogLoading(false);
          }
        }
      }
    }

    async function loadCatalog() {
      const merged: LiveItem[] = [];
      // Solo para el inicio: candidatos por búsqueda, en el mismo orden que
      // HOME_TEASER_QUERIES, para poder elegir después el que tenga foto
      // (ver pickHomeTeaserWithPhotos). En un rubro puntual seguimos
      // mostrando todo tal como llega, sin esperar fotos.
      const homeSlots: LiveItem[][] = isHome ? queries.map(() => []) : [];

      await runBatch(queries, merged, homeSlots, 0);

      // La tanda entera de un rubro vino vacía: antes de rendirse (y antes
      // de caer al caché viejo o al cartel de error), probamos UNA vez más.
      // Esto es justamente para el caso de Precios Claros teniendo un
      // momento flojo: un segundo intento, unos segundos después, suele
      // alcanzar. No se reintenta en "Ver más" (isFirstPage=false) ni en
      // "Todos": ahí el usuario ya está viendo productos y prefiere apretar
      // el botón de nuevo que esperar un reintento silencioso.
      if (!cancelled && !isHome && isFirstPage && merged.length === 0) {
        setCatalogStatus('Precios Claros no respondió — reintentando...');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (cancelled) return;
        await runBatch(queries, merged, homeSlots, 0);
      }

      if (cancelled) return;
      setLoadingMore(false);
      // Terminaron TODAS las tandas (+ el reintento si hizo falta): recién
      // ahora, si no vino nada, vale mostrar el estado vacío.
      if (!isHome) setCatalogLoading(false);

      let finalItems = merged;
      if (isHome) {
        finalItems = await pickHomeTeaserWithPhotos(homeSlots);
        if (!cancelled) {
          setCatalogItems(finalItems);
          setCatalogLoading(false);
        }
      }

      if (finalItems.length) {
        // se pudo traer bien: guardamos la primera tanda como respaldo para
        // el día que la API de Precios Claros esté caída o bloqueando.
        if (isFirstPage) saveCatalogCache(activeCategory, finalItems);
        setCatalogStatus('');
      } else if (isFirstPage) {
        // la API no devolvió nada (caída, bloqueo, timeout): probamos
        // mostrar el último catálogo bueno que teníamos guardado en vez de
        // dejar la pantalla vacía.
        const cached = loadCatalogCache(activeCategory);
        if (cached) {
          setCatalogItems(cached.items);
          setCatalogStatus(
            `No pudimos actualizar los precios ahora — mostrando el catálogo de ${formatCacheAge(cached.savedAt)}.`
          );
        } else {
          setCatalogStatus('No pudimos traer el catálogo desde Precios Claros ahora mismo.');
        }
      }
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [coords, activeCategory, catalogPage, catalogRetryKey]);

  // guarda el carrito (y los productos en vivo que contiene) en Supabase,
  // con un pequeño debounce para no pegarle a la base en cada click. No
  // corre hasta que terminó de cargar el carrito inicial, para no pisar lo
  // que ya estaba guardado con un carrito vacío apenas monta el componente.
  useEffect(() => {
    if (!cartLoaded) return;
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      setSyncing(true);
      const ok = await saveCart(userId, { items: selected, liveProducts });
      setSyncing(false);
      setSyncError(!ok);
    }, 600);
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
    };
  }, [selected, liveProducts, cartLoaded, userId]);

  // búsqueda en vivo contra Precios Claros (vía nuestro proxy /api/productos)
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);

    if (searchTerm.trim().length < 3) {
      // Si venimos de escanear un código que no se pudo identificar,
      // handleBarcodeDetected ya dejó seteados el mensaje y el estado
      // correctos con el término de búsqueda vacío a propósito — no los
      // pisamos acá solo porque "no hay término para buscar".
      if (!scannedEan) {
        setLiveMode(false);
        setLiveStatus('');
      }
      return;
    }

    setLiveMode(true);

    if (!coords) {
      setLiveLoading(true);
      setLiveStatus('Necesitamos tu ubicación para buscar precios. Habilitala y volvé a intentar.');
      setLiveItems([]);
      return;
    }

    searchDebounce.current = setTimeout(async () => {
      setLiveLoading(true);
      setLiveStatus('Consultando precios oficiales...');
      try {
        const res = await fetch(
          `/api/productos?q=${encodeURIComponent(searchTerm.trim())}&lat=${coords.lat}&lng=${coords.lng}&smart=1`
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const items: LiveItem[] = data.productos || [];
        setLiveItems(items);
        setLiveStatus(
          items.length
            ? data.aproximada
              ? 'No hay una coincidencia exacta — te mostramos los más parecidos. Datos de Precios Claros.'
              : data.relacionados
              ? `Mostrando "${searchTerm.trim()}" y productos relacionados. Datos de Precios Claros.`
              : 'Datos en vivo — Precios Claros (Secretaría de Comercio)'
            : scannedEan
            ? 'No encontramos ese producto escaneado en Precios Claros. Probá buscarlo escribiendo el nombre.'
            : `Sin resultados en Precios Claros para "${searchTerm.trim()}".`
        );
      } catch {
        setLiveStatus('La API de Precios Claros no respondió. Probá de nuevo en un momento.');
        setLiveItems([]);
      } finally {
        setLiveLoading(false);
      }
    }, 450);

    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchTerm, coords, scannedEan]);

  function handleSearchChange(v: string) {
    // Si el usuario tipea a mano, ya no estamos mostrando "el resultado de
    // tal escaneo puntual", volvemos a una búsqueda de texto normal.
    setScannedEan(null);
    setSearchTerm(v);
  }

  // Precios Claros busca por NOMBRE de producto, no por código de barras: si
  // mandábamos el código escaneado tal cual (solo números) como término de
  // búsqueda, nunca iba a matchear nada ahí adentro (por eso "no daba
  // resultados"). Ahora primero traducimos el código a un nombre real vía
  // Open Food Facts y recién con ESE nombre disparamos la búsqueda de
  // precios. El filtro por EAN exacto (displayedLiveItems) se sigue
  // encargando de destacar, entre los resultados de ese nombre, el producto
  // que matchea el código escaneado.
  const handleBarcodeDetected = useCallback(async (code: string) => {
    const trimmed = code.trim();
    setScannerOpen(false);
    setScannedEan(trimmed);
    setLiveMode(true);
    setLiveItems([]);
    setLiveLoading(true);
    setLiveStatus('Identificando el producto escaneado...');

    let name = await getProductNameByEan(trimmed);

    // Open Food Facts no lo tiene: antes de darlo por perdido, probamos
    // directo contra Precios Claros con el código como id_producto en las
    // sucursales cercanas (cubre productos regionales que OFF no tiene
    // cargados pero que sí están en la base oficial).
    if (!name && coords && nearbyStores.length) {
      name = await getProductNameFromPreciosClaros(trimmed, nearbyStores);
    }

    if (name && coords) {
      // El nombre de Open Food Facts (marca + producto) a veces trae una
      // palabra de más que Precios Claros no matchea; esto prueba versiones
      // más cortas hasta encontrar una que sí traiga resultados.
      const bestTerm = await resolveSearchableName(name, coords.lat, coords.lng);
      setSearchTerm(bestTerm);
    } else if (name) {
      setSearchTerm(name);
    } else {
      // No lo encontramos en Open Food Facts (puede pasar con marcas chicas
      // o regionales). Antes acá se metía el código escaneado tal cual en la
      // caja de búsqueda — Precios Claros busca por NOMBRE, así que esos
      // dígitos sueltos nunca iban a traer nada, y de paso quedaba un número
      // roto pisando el buscador como si fuera "el nombre" del producto.
      // Avisamos directo en vez de eso.
      setSearchTerm('');
      setLiveItems([]);
      setLiveLoading(false);
      setLiveStatus(
        `No pudimos identificar el código ${trimmed}. Buscalo escribiendo el nombre del producto.`
      );
    }
    // coords es lo único de afuera que usa: con useCallback, la identidad de
    // esta función deja de cambiar en cada render de StoreApp. Importa porque
    // BarcodeScanner la tiene en las dependencias del efecto que arranca la
    // cámara — antes, cualquier re-render (y hay muchos: el catálogo llega de
    // a tandas) reiniciaba la cámara en el medio del escaneo. nearbyStores
    // solo cambia una vez (cuando llegan las sucursales cercanas al
    // arrancar), así que esto no reintroduce ese problema.
  }, [coords, nearbyStores]);

  function popBadge() {
    setCartPop(false);
    if (cartPopTimeout.current) clearTimeout(cartPopTimeout.current);
    // pequeño truco para reiniciar la animación de "pop" del badge
    requestAnimationFrame(() => {
      setCartPop(true);
      cartPopTimeout.current = setTimeout(() => setCartPop(false), 300);
    });
  }

  function toggleSelect(id: string) {
    // Sacar del carrito nunca está limitado — el tope es solo para AGREGAR
    // un producto nuevo (distinto) que todavía no estaba.
    if (!selected[id]) {
      const distinctCount = Object.keys(selected).length;
      if (!premium && distinctCount >= FREE_CART_PRODUCT_LIMIT) {
        setCartLimitNotice(
          `Llegaste al tope de ${FREE_CART_PRODUCT_LIMIT} productos del plan free. Sacá alguno o pasate a premium para un carrito sin límite.`
        );
        return;
      }
    }
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
    popBadge();
  }

  // agrega (o saca, si ya estaba) un producto encontrado en la búsqueda en
  // vivo de Precios Claros. A diferencia del catálogo fijo, estos productos
  // no existen en lib/products.ts, así que guardamos también sus datos.
  function toggleLiveProduct(id: string, product: Product) {
    setLiveProducts((prev) => (prev[id] ? prev : { ...prev, [id]: product }));
    toggleSelect(id);
  }

  function incrementQty(id: string) {
    setSelected((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    popBadge();
  }

  function decrementQty(id: string) {
    setSelected((prev) => {
      const q = prev[id] || 0;
      if (q <= 1) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: q - 1 };
    });
    popBadge();
  }

  // "Vaciar carrito": saca todos los productos de un toque (con confirmación
  // en el propio CartSheet, así un toque de más no borra el changuito).
  function clearCart() {
    setSelected({});
  }

  // Cargar un "changuito guardado": suma sus productos al carrito actual
  // (no lo reemplaza) y respeta el mismo tope de productos distintos del
  // plan free que rige al agregar cualquier producto uno por uno — si no,
  // cargar una plantilla grande sería una forma de saltarse ese límite.
  function handleMergeCartTemplate(tpl: StoredCart) {
    setLiveProducts((prev) => ({ ...prev, ...tpl.liveProducts }));
    let skipped = 0;
    setSelected((prev) => {
      const next = { ...prev };
      let distinctCount = Object.keys(next).length;
      Object.entries(tpl.items).forEach(([id, qty]) => {
        if (!qty || qty <= 0) return;
        if (next[id]) {
          next[id] += qty;
          return;
        }
        if (!premium && distinctCount >= FREE_CART_PRODUCT_LIMIT) {
          skipped++;
          return;
        }
        next[id] = qty;
        distinctCount++;
      });
      return next;
    });
    if (skipped > 0) {
      setCartLimitNotice(
        `Llegaste al tope de ${FREE_CART_PRODUCT_LIMIT} productos del plan free: ${skipped} producto${skipped === 1 ? '' : 's'} del changuito guardado no se agregaron. Pasate a premium para un carrito sin límite.`
      );
    }
    popBadge();
  }

  function handleAcceptSharedCart() {
    if (!sharedCartOffer) return;
    // El link compartido no trae precios (no tiene sentido viajar con
    // ellos: para cuando la otra persona lo abre ya pudieron cambiar).
    // liveProducts queda con prices:{} y se completa solo, igual que
    // cualquier producto agregado desde la búsqueda en vivo.
    const liveProductsFromShare: Record<string, Product> = {};
    Object.entries(sharedCartOffer.products).forEach(([id, p]) => {
      liveProductsFromShare[id] = { name: p.name, category: p.category, ean: p.ean, prices: {}, icon: '' };
    });
    handleMergeCartTemplate({ items: sharedCartOffer.items, liveProducts: liveProductsFromShare });
    setSharedCartOffer(null);
    clearSharedCartFromUrl();
    setCartOpen(true);
  }

  function handleDismissSharedCart() {
    setSharedCartOffer(null);
    clearSharedCartFromUrl();
  }

  // catálogo real filtrado por rubro y por lo que se haya tipeado (buscador
  // local, sin volver a golpear la API mientras el texto tiene <3 caracteres).
  // Memoizado: agrupar y filtrar cientos de productos en cada render se
  // notaba al tipear en el buscador.
  const filteredCatalog = useMemo(
    () =>
      groupLiveItems(catalogItems)
        .filter(({ item }) => {
          const catOk = activeCategory === 'Todos' || item._cat === activeCategory;
          const name = (item.nombre || '').toLowerCase();
          const searchOk = !searchTerm || name.includes(searchTerm.toLowerCase());
          return catOk && searchOk;
        })
        .map(({ item }) => item)
        // En "Todos" (portada) nos quedamos con un puñado variado en vez de
        // mostrar todo lo que trajo el teaser, para que la página no sea larga.
        .slice(0, activeCategory === 'Todos' && !searchTerm ? HOME_TEASER_LIMIT : undefined),
    [catalogItems, activeCategory, searchTerm]
  );

  // Cambiar de rubro o de búsqueda arranca de nuevo en "Todos".
  useEffect(() => {
    setCatalogFilter('todos');
  }, [activeCategory, searchTerm]);

  // Rubros que hay en lo que está cargado (para las píldoras de filtro). Con
  // un rubro elegido arriba hay uno solo y las píldoras sobran.
  const filterCategories = useMemo(() => {
    if (activeCategory !== 'Todos') return [] as string[];
    const all = CATEGORIES.filter((c) => c !== 'Todos');
    // Sin buscar nada: están todos los rubros, porque al tocar uno se piden
    // sus productos (la portada sola trae uno por rubro, y de alguno ni uno).
    if (!searchTerm) return all.filter((c) => !CATALOG_BROWSE_DISABLED.includes(c));
    // Buscando: solo los rubros que tienen algo entre lo que se filtró.
    const present = new Set(filteredCatalog.map((item) => item._cat).filter((c): c is string => !!c));
    return all.filter((c) => present.has(c));
  }, [filteredCatalog, activeCategory, searchTerm]);

  // Modo "rubro": en la portada (sin buscar nada) se eligió un rubro en las
  // píldoras. En ese caso no alcanza con el único producto que trae la
  // portada: se piden más de ese rubro y se muestran de a 10 (con "Mostrar
  // más" abajo de todo). En "Todos" y en "Bajaron" no cambia nada.
  const rubroMode =
    !liveMode && activeCategory === 'Todos' && !searchTerm && catalogFilter !== 'todos' && catalogFilter !== 'bajaron';

  // Todo lo que hay del rubro: el producto de la portada más lo que se fue
  // pidiendo (sin repetidos).
  const rubroAll = useMemo(() => {
    if (!rubroMode) return [] as LiveItem[];
    const base = filteredCatalog.filter((item) => item._cat === catalogFilter);
    return groupLiveItems([...base, ...(rubroItems[catalogFilter] || [])]).map(({ item }) => item);
  }, [rubroMode, filteredCatalog, catalogFilter, rubroItems]);

  const rubroPagesLoaded = rubroMode ? rubroPages[catalogFilter] ?? 0 : 0;
  const rubroCanLoadMore =
    rubroMode && !CATALOG_BROWSE_DISABLED.includes(catalogFilter) && rubroPagesLoaded < catalogPagesFor(catalogFilter);
  const rubroFetching = rubroMode && rubroLoadingCat === catalogFilter;

  const visibleCatalog = useMemo(() => {
    if (rubroMode) return rubroAll.slice(0, rubroLimit);
    if (catalogFilter === 'todos') return filteredCatalog;
    if (catalogFilter === 'bajaron') {
      return filteredCatalog.filter((item) => {
        const ean = extractEan(item);
        return !!ean && dealEans.has(ean);
      });
    }
    return filteredCatalog.filter((item) => item._cat === catalogFilter);
  }, [rubroMode, rubroAll, rubroLimit, filteredCatalog, catalogFilter, dealEans]);

  // Pide UNA tanda de búsquedas del rubro y va sumando lo que llega (en
  // sub-lotes de 6, como la carga del catálogo), así los primeros productos
  // aparecen sin esperar a que termine la tanda entera.
  async function loadRubroPage(cat: string) {
    if (!coords || rubroInFlight.current) return;
    const page = rubroPages[cat] ?? 0;
    if (page >= catalogPagesFor(cat)) return;
    rubroInFlight.current = true;
    setRubroLoadingCat(cat);
    const { lat, lng } = coords;
    const BATCH_SIZE = 6;
    try {
      const queries = catalogQueriesFor(cat, page);
      for (let i = 0; i < queries.length; i += BATCH_SIZE) {
        const batch = queries.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(({ category, query }) =>
            fetch(`/api/productos?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}&limit=${CATALOG_RESULTS_PER_QUERY}`)
              .then((res) => (res.ok ? res.json() : { productos: [] }))
              .then((data) => (data.productos || []).map((p: LiveItem) => ({ ...p, _cat: category })))
              .catch(() => [] as LiveItem[])
          )
        );
        const chunk = results.flat();
        if (chunk.length) setRubroItems((prev) => ({ ...prev, [cat]: [...(prev[cat] || []), ...chunk] }));
      }
    } finally {
      rubroInFlight.current = false;
      // Aunque la tanda haya vuelto vacía se cuenta como pedida, para no
      // reintentar en bucle si Precios Claros está caído.
      setRubroPages((prev) => ({ ...prev, [cat]: page + 1 }));
      setRubroLoadingCat(null);
    }
  }

  // Barrido para "Ofertas cerca tuyo": unas pocas búsquedas de cada rubro, en
  // sub-lotes de 6 como el resto, para que las ofertas salgan de todos los
  // rubros y no solo de los pocos productos de la portada. Se intercalan por
  // rubro para que, con el tope de productos que se revisan, ningún rubro
  // se quede afuera.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    const { lat, lng } = coords;
    const rubros = CATEGORIES.filter((c) => c !== 'Todos' && !CATALOG_BROWSE_DISABLED.includes(c));
    const queries = rubros.flatMap((cat) => catalogQueriesFor(cat, 0).slice(0, DEALS_QUERIES_PER_RUBRO));
    const BATCH_SIZE = 6;

    (async () => {
      const perRubro: LiveItem[][] = rubros.map(() => []);
      for (let i = 0; i < queries.length; i += BATCH_SIZE) {
        const batch = queries.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(({ category, query }) =>
            fetch(`/api/productos?q=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}&limit=${DEALS_RESULTS_PER_QUERY}`)
              .then((res) => (res.ok ? res.json() : { productos: [] }))
              .then((data) => (data.productos || []).map((p: LiveItem) => ({ ...p, _cat: category })))
              .catch(() => [] as LiveItem[])
          )
        );
        if (cancelled) return;
        results.forEach((items, j) => {
          perRubro[rubros.indexOf(batch[j].category)].push(...items);
        });
      }
      const mixed: LiveItem[] = [];
      for (let k = 0; ; k++) {
        let added = false;
        for (const list of perRubro) {
          if (list[k]) {
            mixed.push(list[k]);
            added = true;
          }
        }
        if (!added) break;
      }
      if (!cancelled) setDealsSweep(mixed);
    })();

    return () => {
      cancelled = true;
    };
  }, [coords]);

  // Productos entre los que se buscan ofertas: primero los de la portada (son
  // los que el usuario ve en el catálogo) y después el barrido de todos los rubros.
  const dealsPool = useMemo(() => [...catalogItems, ...dealsSweep], [catalogItems, dealsSweep]);

  // Cambiar de píldora vuelve a empezar en 10.
  useEffect(() => {
    setRubroLimit(RUBRO_PAGE_SIZE);
  }, [catalogFilter, activeCategory, searchTerm]);

  // Pide lo que falta: la primera tanda al elegir el rubro, y otra más si con
  // lo que hay no se llega a llenar lo que se quiere mostrar.
  useEffect(() => {
    if (!rubroMode || !coords || rubroLoadingCat) return;
    if (CATALOG_BROWSE_DISABLED.includes(catalogFilter)) return;
    const loaded = rubroPages[catalogFilter] ?? 0;
    if (loaded >= catalogPagesFor(catalogFilter)) return;
    if (loaded === 0 || rubroAll.length < rubroLimit) loadRubroPage(catalogFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubroMode, coords, catalogFilter, rubroPages, rubroLoadingCat, rubroAll.length, rubroLimit]);

  // diccionario único id -> producto, con los productos que el usuario fue
  // agregando al carrito (todos vienen de Precios Claros, catálogo o búsqueda).
  const productIndex = liveProducts;

  // ¿Quedan más tandas de este rubro para pedir? (En la portada no: el teaser
  // es una sola tanda fija.)
  const hasMoreCatalog =
    activeCategory !== 'Todos' &&
    !searchTerm &&
    !CATALOG_BROWSE_DISABLED.includes(activeCategory) &&
    catalogPage + 1 < catalogPagesFor(activeCategory);

  // Cuando viene de un código escaneado, priorizamos el/los resultado(s)
  // cuyo EAN matchea exacto; si ninguno matchea, mostramos todos los
  // resultados de la búsqueda como respaldo (puede pasar que Precios Claros
  // no tenga cargado justo ese EAN exacto).
  const displayedLiveItems = useMemo(() => {
    if (!scannedEan) return liveItems;
    // normalizeEan saca los ceros de relleno: así "0784070234567" (EAN-13) y
    // "784070234567" (UPC-A) matchean si son el mismo código, sin que el
    // formato con el que vino cada número tape el producto correcto.
    const target = normalizeEan(scannedEan);
    const matches = liveItems.filter((item) => normalizeEan(extractEan(item)) === target);
    return matches.length ? matches : liveItems;
  }, [liveItems, scannedEan]);

  // Antes se comparaba siempre contra la lista fija de 4 cadenas. Ahora
  // usamos los nombres reales de las cadenas que encontramos cerca tuyo
  // (las mismas que ya vienen en nearbyStores), para que cartStats sume
  // contra las cadenas de verdad y no contra nombres que nunca matcheaban.
  const storeNames = useMemo(() => nearbyStores.map((s) => s.chain), [nearbyStores]);

  const { order, chosenEntries } = cartStats(selected, productIndex, storeNames);
  const cartCount = Object.values(selected).reduce((a, b) => a + b, 0);

  // Free: el desglose por súper queda oculto (tarjeta "Comparar ahora")
  // hasta que lo pida explícitamente, y eso gasta uno de los 3 usos de la
  // semana. Si ya desbloqueó ESTE mismo carrito en esta semana, no se le
  // vuelve a cobrar (ver wasAlreadyRevealed): recargar la página no debe
  // costarle un uso. Premium lo ve siempre revelado, sin gastar nada.
  const currentSignature = useMemo(() => cartSignature(selected), [selected]);
  const alreadyPaid = !premium && wasAlreadyRevealed(currentSignature);
  const compareRevealedEffective = premium || compareRevealed || alreadyPaid;
  const compareRemaining = Math.max(0, FREE_COMPARE_LIMIT - compareUsage);

  // Hero de la portada: con el carrito vacío queda el ahorro del mes de
  // siempre. Con productos en el carrito pasa a decir qué súper conviene para
  // ESE carrito, con el mismo cálculo y el mismo orden que "Comparación por
  // súper" (estimatedStoreTotals, hasta 6 cadenas). El veredicto solo se
  // muestra si el desglose ya está desbloqueado: en el plan free eso se
  // desbloquea con "Comparar ahora" (y gasta uno de los usos de la semana).
  const heroTotals = chosenEntries.length ? estimatedStoreTotals(chosenEntries, storeNames).slice(0, 6) : [];
  const heroBest = heroTotals[0];
  const heroWorst = heroTotals.length > 1 ? heroTotals[heroTotals.length - 1] : null;
  const heroCart = chosenEntries.length
    ? {
        count: chosenEntries.length,
        revealed: compareRevealedEffective,
        verdict: heroBest
          ? {
              chain: storeNames[heroBest.storeIndex],
              diff: heroWorst ? heroWorst.total - heroBest.total : 0,
              worstChain: heroWorst ? storeNames[heroWorst.storeIndex] : null,
              estimated: !heroBest.complete,
            }
          : null,
        onCta: compareRevealedEffective ? scrollToCompare : handleCompareNow,
      }
    : null;

  // Qué tan viejo es el precio más viejo del carrito, para poder decirlo en
  // pantalla en vez de prometer "precios actualizados a diario" sin más.
  const pricesAge = oldestPricedAt(selected, liveProducts);
  const pricesAgeLabel = pricesAge ? formatAge(pricesAge) : null;

  // Con cualquier hoja abierta (carrito, ahorros, premium, escáner) el fondo
  // no tiene que poder scrollear: en el celu pasaba que arrastrabas dentro
  // del carrito y se movía la página de atrás, y al cerrar habías perdido el
  // lugar donde estabas.
  const anySheetOpen =
    cartOpen || savingsHistoryOpen || premiumModalOpen || scannerOpen;
  useEffect(() => {
    if (!anySheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [anySheetOpen]);

  // Escape cierra la hoja que esté abierta (la ficha de producto tiene su
  // propio manejo porque vive adentro de CategoryProductList).
  useEffect(() => {
    if (!anySheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      closeAllSheets();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anySheetOpen]);

  // Cerrar TODO lo que esté abierto (hojas y modales). Antes Escape cerraba
  // solo algunos: el modal de Premium se quedaba abierto y encima dejaba el
  // fondo sin poder scrollear.
  function closeAllSheets() {
    setCartOpen(false);
    setSavingsHistoryOpen(false);
    setScannerOpen(false);
    setPremiumModalOpen(false);
  }

  function scrollToCompare() {
    setCartOpen(false);
    setTimeout(() => {
      document.getElementById('mainCompareBlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  }

  // Vuelve a pedir el precio de todo lo que hay en el carrito antes de
  // mostrar la comparación. Sin esto, el desglose se armaba con los precios
  // del momento en que agregaste cada producto — podían ser de hace días.
  async function refreshPricesNow(force = false) {
    if (!nearbyStores.length) return;
    setRefreshingPrices(true);
    try {
      const { updated, changed } = await refreshCartPrices(selected, liveProducts, nearbyStores, {
        force,
      });
      if (changed) setLiveProducts(updated);
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function handleCompareNow() {
    // Premium, o ya desbloqueado (en esta visita o antes con el mismo
    // carrito): no gasta un uso más, solo refresca y hace scroll al bloque.
    if (compareRevealedEffective) {
      scrollToCompare();
      await refreshPricesNow();
      return;
    }
    // Ya se gastaron los 3 de la semana: mostramos el cartel de upgrade en
    // vez del desglose (igual hacemos scroll para que lo vea).
    if (compareRemaining <= 0) {
      setCartLimitNotice(
        `Ya usaste las ${FREE_COMPARE_LIMIT} comparaciones de esta semana del plan free. Pasate a premium para comparar sin límite.`
      );
      scrollToCompare();
      return;
    }
    const next = await registerCompareUse(userId);
    setCompareUsage(next);
    setCompareRevealed(true);
    markRevealed(currentSignature);
    scrollToCompare();
    await refreshPricesNow();
  }

  function handleBottomNavSelect(tab: BottomNavTab) {
    setActiveTab(tab);
    // Cerramos cualquier modal/sheet que haya quedado abierto de una pestaña
    // anterior antes de reaccionar a la nueva, para que nunca se superpongan
    // dos (ej: "Tus ahorros" abierto y encima el carrito).
    setCartOpen(false);
    setSavingsHistoryOpen(false);
    switch (tab) {
      case 'inicio':
        setActiveCategory('Todos');
        handleSearchChange('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'carrito':
        setCartOpen(true);
        break;
      case 'compras':
        setSavingsHistoryOpen(true);
        break;
      case 'escanear':
        setScannerOpen(true);
        break;
      case 'perfil':
        if (userId) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setOpenAccountSignal((k) => k + 1);
        } else {
          router.push('/login');
        }
        break;
    }
  }

  if (!cartLoaded) {
    return (
      <div className="app-loading">
        <div className="loading-cart-wrap">
          <div className="loading-cart-drive">
            <svg className="loading-cart" width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l1.6 9.6a2 2 0 0 0 2 1.7h7.6a2 2 0 0 0 2-1.6L20 8H6.2" />
              <circle cx="9.5" cy="19" r="1.3" />
              <circle cx="16.5" cy="19" r="1.3" />
            </svg>
          </div>
          <div className="loading-track" />
        </div>
        <div>Cargando tu carrito...</div>
      </div>
    );
  }

  return (
    // El data-theme ya no va acá: lo pone el script de arranque sobre
    // <html> (ver lib/theme.ts). Puesto en este div, el fondo del documento
    // seguía blanco en modo oscuro y se veía una franja clara al rebotar el
    // scroll o al abrir /login y /legales.
    <div style={{ minHeight: '100dvh' }}>
      {sharedCartOffer && (
        <div className="shared-cart-banner" role="status">
          <div className="shared-cart-banner-text">
            <strong>Te compartieron un changuito</strong>
            <span>
              {Object.keys(sharedCartOffer.items).length} producto
              {Object.keys(sharedCartOffer.items).length === 1 ? '' : 's'} · se suman al tuyo, no lo reemplazan
            </span>
          </div>
          <div className="shared-cart-banner-actions">
            <button className="shared-cart-banner-accept" onClick={handleAcceptSharedCart}>Sumar al carrito</button>
            <button className="shared-cart-banner-dismiss" aria-label="Descartar" onClick={handleDismissSharedCart}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}
      <div className="wrap">
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          searchValue={searchTerm}
          onSearchChange={handleSearchChange}
          onScan={() => setScannerOpen(true)}
          scrolled={scrolled}
          userId={userId}
          userEmail={userEmail}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenSavingsHistory={() => {
            setCartOpen(false);
            setSavingsHistoryOpen(true);
          }}
          onOpenPremium={() => setPremiumModalOpen(true)}
          premium={premium}
          openAccountSignal={openAccountSignal}
        />

        {/* Invitado: franja en el flujo de la página (no un globito flotante
            que tapaba el buscador). Se cierra con la ×. */}
        {!userId && !accountBannerDismissed && (
          <div className="account-strip" role="region" aria-label="Crear cuenta">
            <p>Creá tu cuenta y guardá tu carrito en cualquier celular.</p>
            <button className="account-strip-cta" onClick={() => router.push('/login')}>
              Crear cuenta
            </button>
            <button
              className="account-strip-close"
              aria-label="Cerrar"
              onClick={() => setAccountBannerDismissed(true)}
            >
              ×
            </button>
          </div>
        )}

        {syncError ? (
          <div className="sync-note">No se pudo guardar el carrito ahora — vamos a reintentar solo.</div>
        ) : syncing ? (
          <div className="sync-note">Guardando carrito...</div>
        ) : null}

        <SavingsCard
          savings={monthlySavings}
          cart={heroCart}
          onOpenHistory={() => {
            setCartOpen(false);
            setSavingsHistoryOpen(true);
          }}
        />

        {/* El buscador subió al header (que es sticky) y el botón grande de
            "Escaneá un código de barras" se fue con él, convertido en un
            ícono adentro de la misma caja: era una tercera puerta al mismo
            escáner que ya tienen el botón central de la barra de abajo y el
            propio buscador, y se comía una franja entera de la portada
            antes de que se viera un solo producto. */}

        {/* La fila de chips de rubros que estaba acá se sacó a pedido: los rubros
            se eligen en las píldoras de abajo, en el catálogo. Las ofertas van
            justo debajo del hero y muestran las de todos los rubros. */}
        {!liveMode && (
          <NearbyDealsFeed
            pool={dealsPool}
            stores={nearbyStores}
            selected={selected}
            onToggle={toggleLiveProduct}
            userId={userId}
            premium={premium}
            onEansChange={setDealEans}
          />
        )}

        <div className="list-header catalog-head" id="catalogo">
          <h2>{liveMode ? 'Resultados' : 'Catálogo'}</h2>
          <div className="list-count">
            {liveMode || catalogLoading || (!searchTerm && CATALOG_BROWSE_DISABLED.includes(activeCategory))
              ? ''
              : `${visibleCatalog.length.toLocaleString('es-AR')} producto${visibleCatalog.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <CatalogFilters
          active={liveMode ? 'todos' : catalogFilter}
          onChange={setCatalogFilter}
          categories={liveMode ? [] : filterCategories}
          showDrops={!liveMode}
          sortOrder={sortOrder}
          onSortChange={setSortOrder}
        />
        {liveMode && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>{liveStatus}</div>}
        {!liveMode && catalogStatus && (catalogLoading || filteredCatalog.length > 0) && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>{catalogStatus}</div>
        )}
        {storesStatus && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginBottom: 14 }}>{storesStatus}</div>
        )}

        <div>
          {liveMode ? (
            liveLoading ? (
              <ListSkeleton rows={3} />
            ) : liveItems.length ? (
              <CategoryProductList
                items={displayedLiveItems}
                stores={nearbyStores}
                selected={selected}
                onToggle={toggleLiveProduct}
                userId={userId}
                premium={premium}
                sortOrder={sortOrder}
              />
            ) : (
              <div className="empty-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
                </svg>
                <div>Sin resultados para &quot;{searchTerm}&quot; en Precios Claros.</div>
              </div>
            )
          ) : catalogLoading || (loadingMore && filteredCatalog.length === 0) ? (
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <div>Cargando productos…</div>
            </div>
          ) : filteredCatalog.length === 0 && !rubroMode ? (
            <div className="empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <div>
                {searchTerm ? (
                  <>No encontramos productos para &quot;{searchTerm}&quot;.</>
                ) : CATALOG_BROWSE_DISABLED.includes(activeCategory) ? (
                  // Este rubro no arma vidriera propia (ver CATALOG_BROWSE_DISABLED):
                  // se invita a buscar o escanear en vez de mostrar un catálogo
                  // que casi siempre iba a volver vacío.
                  'Este rubro no tiene vidriera propia: buscá el producto por nombre o escaneá su código de barra.'
                ) : (
                  'No pudimos traer el catálogo de Precios Claros en este momento.'
                )}
              </div>
              {!searchTerm && !CATALOG_BROWSE_DISABLED.includes(activeCategory) && (
                <button className="cta-btn secondary" onClick={() => setCatalogRetryKey((k) => k + 1)}>
                  Reintentar
                </button>
              )}
            </div>
          ) : rubroMode && visibleCatalog.length === 0 && (rubroFetching || rubroCanLoadMore) ? (
            // Rubro recién elegido y todavía no llegó nada: cargando, no "vacío".
            <div className="loading-state" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <div>Cargando productos…</div>
            </div>
          ) : visibleCatalog.length === 0 ? (
            <div className="empty-state">
              <div>
                {catalogFilter === 'bajaron'
                  ? 'Ahora no hay productos con descuento entre los que cargamos. Volvé a mirar más tarde.'
                  : 'No hay productos en esta selección.'}
              </div>
              <button className="cta-btn secondary" onClick={() => setCatalogFilter('todos')}>
                Ver todos
              </button>
            </div>
          ) : (
            <CategoryProductList
              items={visibleCatalog}
              stores={nearbyStores}
              selected={selected}
              onToggle={toggleLiveProduct}
              userId={userId}
              premium={premium}
              sortOrder={sortOrder}
            />
          )}

          {/* Rubro elegido en las píldoras: "Mostrar más" suma 10 productos del
              mismo rubro. Si con lo cargado no alcanza, el efecto de arriba pide
              la tanda que falta y mientras tanto el botón queda esperando. */}
          {rubroMode && visibleCatalog.length > 0 && (rubroAll.length > rubroLimit || rubroCanLoadMore || rubroFetching) && (
            <button
              className="cta-btn secondary load-more-btn"
              onClick={() => setRubroLimit((l) => l + RUBRO_PAGE_SIZE)}
              disabled={rubroFetching && rubroAll.length <= rubroLimit}
            >
              {rubroFetching && rubroAll.length <= rubroLimit ? 'Buscando más productos…' : 'Mostrar más'}
            </button>
          )}

          {/* El rubro tiene muchísimos más productos, pero se piden de a
              tandas para no disparar cientos de búsquedas de una (ver
              lib/products.ts). Esto trae la tanda siguiente. */}
          {!liveMode && !catalogLoading && hasMoreCatalog && (
            <button
              className="cta-btn secondary load-more-btn"
              onClick={() => setCatalogPage((pg) => pg + 1)}
              disabled={loadingMore}
            >
              {loadingMore ? 'Buscando más productos…' : 'Ver más productos'}
            </button>
          )}
        </div>

        {/* "Dónde conviene hoy": la comparación del carrito por súper. Va abajo
            de todo, después del catálogo. (El botón de comparar sigue llevando
            hasta acá: scrollToCompare busca #mainCompareBlock.) */}
        <CompareSection
          selected={selected}
          productIndex={productIndex}
          stores={storeNames}
          userId={userId}
          premium={premium}
          onSavingLogged={() => setSavingsRefreshKey((k) => k + 1)}
          revealed={compareRevealedEffective}
          remaining={compareRemaining}
          onReveal={handleCompareNow}
          pricesAt={pricesAge}
          refreshing={refreshingPrices}
          onRefreshPrices={() => refreshPricesNow(true)}
          onEdit={() => setCartOpen(true)}
          generalPool={catalogItems}
          generalStores={nearbyStores}
        />

      </div>

      <Footer />

      <CartSheet
        open={cartOpen}
        onClose={() => {
          setCartOpen(false);
          // La pestaña quedaba marcada en "Carrito" después de cerrar la
          // hoja, así que la barra de abajo decía que estabas en una
          // pantalla que ya no estaba abierta.
          setActiveTab('inicio');
        }}
        selected={selected}
        productIndex={productIndex}
        stores={storeNames}
        onIncrement={incrementQty}
        onDecrement={decrementQty}
        onCompareNow={handleCompareNow}
        onMergeCart={handleMergeCartTemplate}
        onClearCart={clearCart}
        pricesAgeLabel={pricesAgeLabel}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeDetected}
      />

      <SavingsHistoryModal
        open={savingsHistoryOpen}
        onClose={() => {
          setSavingsHistoryOpen(false);
          setActiveTab('inicio');
        }}
        userId={userId}
        refreshKey={savingsRefreshKey}
      />

      <PremiumModal
        open={premiumModalOpen}
        onClose={() => setPremiumModalOpen(false)}
        premium={premium}
        userId={userId}
        userEmail={userEmail}
      />

      <BottomNav
        active={activeTab}
        cartCount={cartCount}
        cartPop={cartPop}
        onSelect={handleBottomNavSelect}
      />

      {cartLimitNotice && (
        <div className="cart-limit-toast" role="status" aria-live="polite">
          {cartLimitNotice}
        </div>
      )}
    </div>
  );
}

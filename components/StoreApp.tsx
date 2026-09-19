'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { loadCart, saveCart, StoredCart } from '@/lib/cart';
import { createClient } from '@/lib/supabase/client';
import { CartMap, Product } from '@/lib/types';
import {
  CATALOG_RESULTS_PER_QUERY,
  HOME_TEASER_QUERIES,
  HOME_TEASER_LIMIT,
  HOME_TEASER_RESULTS_PER_QUERY,
  catalogPagesFor,
  catalogQueriesFor,
} from '@/lib/products';
import { cartStats } from '@/lib/cartStats';
import { formatAge, oldestPricedAt, refreshCartPrices } from '@/lib/cartPrices';
import { getMonthlyHistory, migrateGuestSavingsToAccount } from '@/lib/savingsHistory';
import { FREE_CART_PRODUCT_LIMIT, isPremium } from '@/lib/premium';
import { FREE_COMPARE_LIMIT, cartSignature, getCompareUsage, markRevealed, registerCompareUse, wasAlreadyRevealed } from '@/lib/compareLimit';
import { clearSharedCartFromUrl, readSharedCartFromUrl, SharedCartPayload } from '@/lib/sharedCart';
import { applyTheme, resolveInitialTheme, readStoredTheme, systemTheme, Theme } from '@/lib/theme';

import Header from './Header';
import SavingsCard from './SavingsCard';
import CategoryChips from './CategoryChips';
import { extractEan, groupLiveItems, LiveItem, normalizeEan, SortOrder } from '@/lib/liveItems';
import { getProductImageUrl, getProductNameByEan, photoLookupName, resolveSearchableName } from '@/lib/productImage';
import CategoryProductList from './CategoryProductList';
import SortMenu from './SortMenu';
import { fetchNearbyStores, NearbyStore } from '@/lib/storePrices';
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

  // Vidriera inicial (sin buscar nada): también sale de Precios Claros, no
  // de datos inventados. Se arma con varias búsquedas fijas por rubro.
  const [catalogItems, setCatalogItems] = useState<LiveItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogStatus, setCatalogStatus] = useState('');
  // Qué tanda del rubro estamos mostrando. Cada tanda son unas pocas
  // búsquedas (CATALOG_QUERIES_PER_PAGE), no el rubro entero: ver el
  // comentario largo en lib/products.ts sobre por qué.
  const [catalogPage, setCatalogPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [storesStatus, setStoresStatus] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

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
    loadCart(userId).then((stored) => {
      if (cancelled) return;
      setSelected(stored.items);
      setLiveProducts(stored.liveProducts);
      setCartLoaded(true);
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
  // guardada, o la del sistema si nunca eligió) y, mientras no haya elegido
  // a mano, sigue al sistema en vivo: si el celular pasa a oscuro de noche,
  // la app acompaña sin recargar.
  useEffect(() => {
    setTheme(resolveInitialTheme());
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readStoredTheme()) return; // eligió a mano: su elección manda
      const next = systemTheme();
      setTheme(next);
      applyTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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
  // búsqueda en vivo. Si el usuario no da permiso de ubicación, usamos un
  // punto fijo en Buenos Aires para que la función igual sirva de algo.
  useEffect(() => {
    const BA_FALLBACK = { lat: -34.6037, lng: -58.3816 };

    function loadStores(lat: number, lng: number, usedFallback: boolean) {
      setCoords({ lat, lng });
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

    if (!navigator.geolocation) {
      loadStores(BA_FALLBACK.lat, BA_FALLBACK.lng, true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => loadStores(pos.coords.latitude, pos.coords.longitude, false),
      () => loadStores(BA_FALLBACK.lat, BA_FALLBACK.lng, true),
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

    async function loadCatalog() {
      const merged: LiveItem[] = [];
      // Solo para el inicio: candidatos por búsqueda, en el mismo orden que
      // HOME_TEASER_QUERIES, para poder elegir después el que tenga foto
      // (ver pickHomeTeaserWithPhotos). En un rubro puntual seguimos
      // mostrando todo tal como llega, sin esperar fotos.
      const homeSlots: LiveItem[][] = isHome ? queries.map(() => []) : [];
      for (let i = 0; i < queries.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = queries.slice(i, i + BATCH_SIZE);
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
            homeSlots[i + j] = candidates;
          });
          // Acá no pisamos catalogItems todavía: si mostráramos el primer
          // candidato de cada rubro apenas llega y después lo cambiáramos
          // por el que sí tiene foto, la portada "parpadearía". Se espera a
          // tener todos los candidatos (ver más abajo).
        } else {
          merged.push(...results.flat());
          if (!cancelled) {
            // vamos mostrando lo que ya llegó, en vez de tapar todo hasta el final
            setCatalogItems((prev) => (isFirstPage ? [...merged] : [...prev, ...results.flat()]));
            setCatalogLoading(false);
          }
        }
      }
      if (cancelled) return;
      setLoadingMore(false);

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
  }, [coords, activeCategory, catalogPage]);

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
          `/api/productos?q=${encodeURIComponent(searchTerm.trim())}&lat=${coords.lat}&lng=${coords.lng}`
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const items: LiveItem[] = data.productos || [];
        setLiveItems(items);
        setLiveStatus(
          items.length
            ? 'Datos en vivo — Precios Claros (Secretaría de Comercio)'
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

    const name = await getProductNameByEan(trimmed);
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
    // a tandas) reiniciaba la cámara en el medio del escaneo.
  }, [coords]);

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

  // diccionario único id -> producto, con los productos que el usuario fue
  // agregando al carrito (todos vienen de Precios Claros, catálogo o búsqueda).
  const productIndex = liveProducts;

  // ¿Quedan más tandas de este rubro para pedir? (En la portada no: el teaser
  // es una sola tanda fija.)
  const hasMoreCatalog =
    activeCategory !== 'Todos' && !searchTerm && catalogPage + 1 < catalogPagesFor(activeCategory);

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
          showAccountHint={!userId && !accountBannerDismissed}
          onDismissAccountHint={() => setAccountBannerDismissed(true)}
        />

        {syncError ? (
          <div className="sync-note">No se pudo guardar el carrito ahora — vamos a reintentar solo.</div>
        ) : syncing ? (
          <div className="sync-note">Guardando carrito...</div>
        ) : null}

        <SavingsCard
          savings={monthlySavings}
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
        {!liveMode && (
          <NearbyDealsFeed
            pool={catalogItems}
            stores={nearbyStores}
            selected={selected}
            onToggle={toggleLiveProduct}
            userId={userId}
            premium={premium}
          />
        )}

        <CategoryChips active={activeCategory} onSelect={setActiveCategory} />

        <div className="list-header">
          <h2>{liveMode ? 'Resultados de Precios Claros' : 'Catálogo · Precios Claros'}</h2>
          <div className="list-header-right">
            <SortMenu value={sortOrder} onChange={setSortOrder} />
            <div className="list-count">
              {liveMode ? '' : `${filteredCatalog.length} producto${filteredCatalog.length === 1 ? '' : 's'}`}
            </div>
          </div>
        </div>
        {liveMode && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>{liveStatus}</div>}
        {!liveMode && catalogStatus && (
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
          ) : catalogLoading ? (
            <ListSkeleton rows={5} />
          ) : filteredCatalog.length === 0 ? (
            <div className="empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <div>No encontramos productos para &quot;{searchTerm}&quot;.</div>
            </div>
          ) : (
            <CategoryProductList
              items={filteredCatalog}
              stores={nearbyStores}
              selected={selected}
              onToggle={toggleLiveProduct}
              userId={userId}
              premium={premium}
              sortOrder={sortOrder}
            />
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
          pricesAgeLabel={pricesAgeLabel}
          refreshing={refreshingPrices}
          onRefreshPrices={() => refreshPricesNow(true)}
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

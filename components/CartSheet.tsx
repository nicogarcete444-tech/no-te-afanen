'use client';

import { useEffect, useState } from 'react';
import { CATEGORY_COLORS } from '@/lib/categories';
import { fmt } from '@/lib/format';
import { cartStats, potentialSavings } from '@/lib/cartStats';
import { CartMap, Product, lowestKnownPrice } from '@/lib/types';
import { eanFromCartId, getProductImageUrl, getProductImageUrlByName } from '@/lib/productImage';
import { StoredCart } from '@/lib/cart';
import { CartTemplate, deleteTemplate, listTemplates, saveTemplate } from '@/lib/cartTemplates';
import { buildShareUrl } from '@/lib/sharedCart';

function CartItemPhoto({ id, name, ca, cb }: { id: string; name: string; ca: string; cb: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Si el id ya trae el EAN real (productos agregados desde la búsqueda en
    // vivo), lo usamos directo: es más confiable que volver a adivinar el
    // producto a partir del nombre.
    const ean = eanFromCartId(id);
    const lookup = ean ? getProductImageUrl(ean, name) : getProductImageUrlByName(name);
    lookup.then((found) => {
      if (!cancelled) setUrl(found);
    });
    return () => {
      cancelled = true;
    };
  }, [id, name]);

  if (url) {
    return (
      <div className="cart-item-media" style={{ background: '#fff', padding: 3 }}>
        <img
          src={url}
          alt=""
          width={42}
          height={42}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          onError={() => setUrl(null)}
        />
      </div>
    );
  }

  return (
    <div className="cart-item-media" style={{ ['--media-a' as any]: ca, ['--media-b' as any]: cb }}>
      {/* El campo Product.icon (paths SVG en texto) nunca se llena hoy — todo el
          código lo inicializa en '' — así que inyectarlo con
          dangerouslySetInnerHTML no dibujaba nada, pero dejaba la puerta
          abierta: el día que alguien lo cargue desde una fuente externa (API,
          carrito compartido), es un XSS servido en bandeja. Se saca la
          inyección; si en el futuro hace falta un ícono acá, que sea un
          switch de paths fijos como en CategoryIcon.tsx, nunca HTML crudo. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </div>
  );
}

function CartTemplates({
  currentCart,
  hasItems,
  onLoad,
}: {
  currentCart: StoredCart;
  hasItems: boolean;
  onLoad: (cart: StoredCart) => void;
}) {
  const [templates, setTemplates] = useState<CartTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Se leen recién al montar (no hace falta más: esta lista solo cambia por
  // acciones del propio usuario acá adentro, que ya actualizan el estado a
  // mano después de guardar/borrar).
  useEffect(() => {
    setTemplates(listTemplates());
  }, []);

  function handleSave() {
    const tpl = saveTemplate(name, currentCart);
    if (!tpl) return;
    setTemplates(listTemplates());
    setSaving(false);
    setName('');
  }

  function handleDelete(id: string) {
    deleteTemplate(id);
    setTemplates(listTemplates());
  }

  function handleLoad(t: CartTemplate) {
    onLoad(t.cart);
    setLoadedId(t.id);
    setTimeout(() => setLoadedId((cur) => (cur === t.id ? null : cur)), 1800);
  }

  // Sin changuitos guardados y con el carrito vacío no hay nada útil que
  // mostrar acá — ni un botón de guardar (no hay qué) ni una lista vacía.
  if (!hasItems && !templates.length) return null;

  return (
    <div className="cart-templates">
      <div className="cart-templates-head">
        <span>Changuitos guardados</span>
        {hasItems && !saving && (
          <button className="cart-templates-save-btn" onClick={() => setSaving(true)}>
            + Guardar este
          </button>
        )}
      </div>

      {saving && (
        <div className="cart-templates-form">
          <input
            autoFocus
            className="cart-templates-input"
            placeholder="Ej: Compra del mes"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setSaving(false);
                setName('');
              }
            }}
          />
          <button className="cart-templates-confirm" onClick={handleSave} disabled={!name.trim()}>
            Guardar
          </button>
          <button
            className="cart-templates-cancel"
            aria-label="Cancelar"
            onClick={() => {
              setSaving(false);
              setName('');
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="cart-templates-list">
          {templates.map((t) => {
            const count = Object.values(t.cart.items).reduce((a, b) => a + b, 0);
            return (
              <div className="cart-template-row" key={t.id}>
                <button className="cart-template-load" onClick={() => handleLoad(t)}>
                  <span className="cart-template-name">{t.name}</span>
                  <span className="cart-template-count">
                    {loadedId === t.id ? 'Agregado ✓' : `${count} producto${count === 1 ? '' : 's'}`}
                  </span>
                </button>
                <button className="cart-template-delete" aria-label={`Borrar "${t.name}"`} onClick={() => handleDelete(t.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CartShareButton({
  selected,
  productIndex,
  hasItems,
}: {
  selected: CartMap;
  productIndex: Record<string, Product>;
  hasItems: boolean;
}) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  if (!hasItems) return null;

  async function handleShare() {
    const url = buildShareUrl(selected, productIndex);
    if (!url) return;

    // Share nativo del celular si está disponible (manda directo por
    // WhatsApp, mensajes, etc. sin pasos extra). Si el usuario cancela el
    // cuadro de share, no es un error — simplemente no hace nada más.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Mi changuito — No Te Afanen', url });
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // Portapapeles bloqueado por el navegador: no hay mucho más para
      // hacer sin un prompt feo. Se puede reintentar apretando de nuevo.
    }
  }

  return (
    <button className="cart-sheet-share-btn" onClick={handleShare}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" />
      </svg>
      {state === 'copied' ? 'Link copiado ✓' : 'Compartir'}
    </button>
  );
}

export default function CartSheet({
  open,
  onClose,
  selected,
  productIndex,
  stores,
  onIncrement,
  onDecrement,
  onCompareNow,
  onMergeCart,
  onClearCart,
  pricesAgeLabel,
}: {
  open: boolean;
  onClose: () => void;
  selected: CartMap;
  productIndex: Record<string, Product>;
  stores: string[];
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onCompareNow: () => void;
  onMergeCart: (cart: StoredCart) => void;
  onClearCart?: () => void;
  pricesAgeLabel?: string | null;
}) {
  const { chosenEntries, order, complete } = cartStats(selected, productIndex, stores);
  // Mismo cálculo que se usa para registrar el ahorro al confirmar la lista
  // (ver potentialSavings): así el número que se muestra acá siempre
  // coincide con el que después se suma al historial.
  const savingAmount = potentialSavings(chosenEntries);
  const bestCompleteIdx = order.find((i) => complete[i]);

  return (
    <div className={`cart-overlay${open ? ' show' : ''}`} onClick={onClose}>
      <div className="cart-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cart-sheet-head">
          <h3>Tu carrito</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {chosenEntries.length > 0 && onClearCart && (
              <button
                type="button"
                className="cart-sheet-clear-btn"
                onClick={() => {
                  if (window.confirm('¿Vaciar el carrito? Se van a sacar todos los productos.')) {
                    onClearCart();
                  }
                }}
              >
                Vaciar
              </button>
            )}
            <CartShareButton selected={selected} productIndex={productIndex} hasItems={chosenEntries.length > 0} />
            <button className="cart-sheet-close" aria-label="Cerrar" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="cart-sheet-list">
          {chosenEntries.length === 0 ? (
            <div className="cart-sheet-empty">
              Todavía no agregaste productos. Tocá &quot;Agregar&quot; en cualquier producto del catálogo.
            </div>
          ) : (
            <div className="cart-items-block">
              {chosenEntries.map((p) => {
                const minP = lowestKnownPrice(p.prices);
                const [ca, cb] = CATEGORY_COLORS[p.category] || ['#B9C0BB', '#8B948A'];
                return (
                  <div className="cart-item" key={p.id}>
                    <div className="cart-item-left">
                      <CartItemPhoto id={p.id} name={p.name} ca={ca} cb={cb} />
                      <div>
                        <div className="cart-item-name">{p.name}</div>
                        <div className="cart-item-price">
                          {minP !== null ? `desde ${fmt(minP)} c/u` : 'sin precio confirmado por súper'}
                        </div>
                      </div>
                    </div>
                    <div className="qty-stepper">
                      <button className="qty-btn" aria-label="Quitar uno" onClick={() => onDecrement(p.id)}>−</button>
                      <span className="qty-val">{p.qty}</span>
                      <button className="qty-btn" aria-label="Agregar uno" onClick={() => onIncrement(p.id)}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <CartTemplates
            currentCart={{ items: selected, liveProducts: productIndex }}
            hasItems={chosenEntries.length > 0}
            onLoad={onMergeCart}
          />
        </div>

        <div className="cart-sheet-foot">
          {chosenEntries.length === 0 ? (
            <div className="cart-sheet-footnote">
              Precios oficiales de Precios Claros, de las cadenas que hay cerca tuyo.
            </div>
          ) : (
            <>
              <div className="cart-sheet-total">
                <span className="label">
                  {bestCompleteIdx !== undefined
                    ? `Ahorrás yendo a ${stores[bestCompleteIdx]}`
                    : 'Ahorrás eligiendo el súper más barato para cada producto'}
                </span>
                <span className="val">{fmt(savingAmount)}</span>
              </div>
              <button className="cta-btn" onClick={onCompareNow}>Comparar ahora</button>
              <div className="cart-sheet-footnote">
                {pricesAgeLabel
                  ? `Precios traídos ${pricesAgeLabel} · se actualizan al comparar`
                  : 'Los precios se traen de Precios Claros al comparar'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { CATEGORIES } from '@/lib/products';

// Los iconos de los chips, redibujados.
//
// El problema de la versión anterior no era el estilo sino que varios no se
// entendían al tamaño real (15px): el de Limpieza era un rayón de líneas
// cruzadas, el de Congelados tenía 16 marquitas que se empastaban en una
// mancha, y Frescos y Verdulería eran literalmente la misma gota con un palito
// (igual que Bebidas y Perfumería, que eran la misma botella). Con el rubro
// escrito al lado se zafa, pero entonces el icono no aporta nada.
//
// Criterios de este redibujo, en orden:
//
// 1. Una silueta por rubro, todas distintas entre sí. Es lo que permite
//    reconocer el chip de un vistazo sin leer.
// 2. Nada de detalle interior que no sobreviva a 15px: como mucho una línea
//    (la etiqueta de la botella, la tapa de la lata).
// 3. Las formas ocupan casi todo el viewBox de 24. Los dibujos chiquitos en el
//    medio de la caja se ven borrosos cuando se escalan para abajo.
//
// Tres formas que probé y descarté, anotadas para que nadie repita el trabajo:
//   - Limpieza como balde, como escoba y como cepillo: el balde sale idéntico
//     a un tacho de basura (o sea "borrar", malísimo en una UI), la escoba a
//     una pala y el cepillo a un fibrón.
//   - Frescos como feta de fiambre (círculo con dos puntitos de grasa): se lee
//     como una carita con dos ojos.
//   - Congelados con las puntas en flecha: se lee como el icono de expandir.
function CategoryIcon({ category, active }: { category: string; active: boolean }) {
  const stroke = active ? 'var(--accent)' : 'var(--ink-soft)';
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (category) {
    // Grilla de cuatro: el "ver todo" de siempre.
    case 'Todos':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="4" y="4" width="6.6" height="6.6" rx="1.7" />
          <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.7" />
          <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.7" />
          <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.7" />
        </svg>
      );

    // Cartón de leche. El techo va en trapecio y no en punta: en punta el
    // dibujo se lee como un lápiz o como una casita.
    case 'Lácteos':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9.4 6.4V3.6h5.2v2.8" />
          <path d="M7 10.2l2.4-3.8h5.2L17 10.2" />
          <path d="M7 10.2h10v9.4a1.8 1.8 0 0 1-1.8 1.8H8.8A1.8 1.8 0 0 1 7 19.6Z" />
        </svg>
      );

    // Frasco con tapa: es el original, sin tocar. La lata que había probado no
    // aportaba nada que este no hiciera ya.
    case 'Almacén':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M7 8V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V8" />
          <rect x="5.5" y="8" width="13" height="13" rx="2" />
          <path d="M9 12h6" />
        </svg>
      );

    // Gatillo de limpiador, ahora rociando. La botella sola no alcanzaba: sin
    // las gotitas saliendo del pico se leía como "un envase más" y no como el
    // acto de limpiar. Las tres gotitas son lo que convierte el dibujo en un
    // verbo.
    case 'Limpieza':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M13.2 3.6h3.4l-2 3" />
          <path d="M9.4 6.6h4v2.4h-4z" />
          <path d="M8.4 9h6a2 2 0 0 1 2 2v8.6a1.9 1.9 0 0 1-1.9 1.9H8.3a1.9 1.9 0 0 1-1.9-1.9V11a2 2 0 0 1 2-2Z" />
          <path d="M19.4 4.2h.01M21 6.4h.01M19.2 8.8h.01" />
        </svg>
      );

    // Botella con cuello y etiqueta.
    case 'Bebidas':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M10 3.2h4v3l2 2.4a3 3 0 0 1 .7 1.9v8.6a1.9 1.9 0 0 1-1.9 1.9H9.2a1.9 1.9 0 0 1-1.9-1.9v-8.6a3 3 0 0 1 .7-1.9l2-2.4v-3" />
          <path d="M7.3 13.2h9.4" />
        </svg>
      );

    // Frasco de perfume con el bulbo del atomizador al costado. El jabón con
    // burbujas que había puesto antes decía "higiene" pero no decía
    // "perfumería", y encima pisaba el terreno de Limpieza.
    //
    // El bulbo (el círculo grande) es a propósito y no son gotitas: Limpieza,
    // acá al lado, ya usa tres puntitos de vapor. Si los dos rubros rociaran,
    // a 15px quedarían dos frascos con puntitos y no se distinguirían. Una
    // pelota sola contra tres puntos chiquitos se separa de un vistazo.
    case 'Perfumería':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M8.2 10V7.2h3.8V10" />
          <rect x="5.6" y="10" width="9" height="11" rx="2.2" />
          <path d="M12.4 8.4h2.6" />
          <circle cx="17.6" cy="8.4" r="2.5" />
        </svg>
      );

    // Cubiertos. Frescos es un rubro mezclado a propósito (pollo, carne
    // picada, jamón, queso, papa, banana), así que cualquier producto puntual
    // que dibujara iba a describir mal la mitad de la lista. Los cubiertos son
    // el genérico honesto de "comida fresca", y son además la única silueta
    // vertical fina del set.
    case 'Frescos':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6.1 3.2v4.3M8.3 3.2v4.3M10.5 3.2v4.3" />
          <path d="M6.1 7.5a2.2 2.2 0 0 0 4.4 0" />
          <path d="M8.3 9.7v11.1" />
          <path d="M15.7 20.8V3.4c1.9 1.1 3 3 3 5.4 0 2.1-1.1 3.5-3 4" />
        </svg>
      );

    // Zanahoria. Frutas y verduras se podía dibujar como manzana, pero la
    // manzana quedaba igual a la gota que tenía Frescos antes; la zanahoria
    // tiene silueta propia (triángulo hacia abajo más dos hojas).
    case 'Verdulería':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 8c-.9-1.8-2.7-2.5-4.1-2 .3 2 2 3.1 4.1 2Z" />
          <path d="M12 8c.9-1.8 2.7-2.5 4.1-2-.3 2-2 3.1-4.1 2Z" />
          <path d="M12 10.8V7.6" />
          <path d="M8.6 10.8h6.8L12 21.4Z" />
        </svg>
      );

    // Copo de nieve: tres ejes y ramas SOLO en el eje vertical. Las ramas en
    // los seis extremos se empastan a 15px, y si salen desde la punta hacia
    // afuera el dibujo pasa a leerse como flechas.
    case 'Congelados':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
          <path d="M9.7 5.3 12 7.6l2.3-2.3M9.7 18.7 12 16.4l2.3 2.3" />
        </svg>
      );

    default:
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="7.6" />
        </svg>
      );
  }
}

export default function CategoryChips({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (c: string) => void;
}) {
  return (
    // Los chips eran <div onClick>: no se podían tabular ni activar con
    // Enter, y un lector de pantalla los leía como texto suelto. Como
    // <button> se comportan como lo que son y además avisan cuál está
    // elegido (aria-pressed).
    <div className="chip-row" role="group" aria-label="Rubros">
      {CATEGORIES.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            type="button"
            className={`chip${isActive ? ' active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onSelect(c)}
          >
            <span className="chip-icon">
              <CategoryIcon category={c} active={isActive} />
            </span>
            {c}
            <span className="chip-underline" />
          </button>
        );
      })}
    </div>
  );
}

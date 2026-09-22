// Iconos de los rubros, para las píldoras de filtro del catálogo
// (CatalogFilters). Usan currentColor: toman el color del texto de la píldora,
// así que cambian solos cuando la píldora está elegida.
//
// Criterios con los que se dibujaron, en orden:
//
// 1. Una silueta por rubro, todas distintas entre sí.
// 2. Nada de detalle interior que no sobreviva a ~16px.
// 3. Las formas ocupan casi todo el viewBox de 24.
//
export default function CategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (category) {
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

    // Bife de chorizo con el hueso en T. Con un círculo adentro en vez de la T
    // se leía como un ojo; la T es lo que dice "corte de carne".
    case 'Carnes':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4.4 11.6c0-3.6 3.3-6.1 7.6-6.1 4.4 0 7.6 2.3 7.6 5.6 0 4.5-3.7 7.5-8.4 7.5-4.2 0-6.8-2.6-6.8-7Z" />
          <path d="M8.6 10.4h6.8M12 10.4v5.4" />
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

    // Huella: pad grande abajo, cuatro dedos arriba en arco. Es la silueta
    // más reconocible para "mascotas" sin tener que elegir entre perro y
    // gato (el rubro tiene comida de los dos).
    case 'Mascotas':
      return (
        <svg {...common} aria-hidden="true">
          <ellipse cx="12" cy="16.3" rx="4.3" ry="3.5" />
          <circle cx="6.2" cy="10" r="1.9" />
          <circle cx="10" cy="6.7" r="1.9" />
          <circle cx="14" cy="6.7" r="1.9" />
          <circle cx="17.8" cy="10" r="1.9" />
        </svg>
      );

    default:
      return null;
  }
}

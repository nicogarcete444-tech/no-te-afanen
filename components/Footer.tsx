import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <span className="footer-brand-name">No Te Afanen</span>
          <span className="footer-brand-tag">Comparador de precios de supermercados, con datos oficiales de Precios Claros.</span>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <div className="footer-label">Legal</div>
            <Link href="/legal/terminos">Términos y condiciones</Link>
            <Link href="/legal/privacidad">Política de privacidad</Link>
            <Link href="/legal#contacto">Contacto</Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} No Te Afanen</span>
          <span>Los precios son orientativos — confirmalos en el súper antes de comprar.</span>
        </div>
      </div>
    </footer>
  );
}

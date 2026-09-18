import { fmt } from '@/lib/products';

export default function SavingsCard({
  savings,
  onOpenHistory,
}: {
  savings: number;
  onOpenHistory?: () => void;
}) {
  return (
    <div>
      <div className="savings-card">
        <div className="savings-copy">
          <div className="savings-label">Ahorrá este mes</div>
          <div className="savings-amount">{fmt(savings)}</div>
          <div className="savings-detail">
            {savings > 0
              ? 'Sumado de cada lista de compras que confirmaste este mes.'
              : 'Armá tu carrito, compará y confirmá la lista: el ahorro se suma acá.'}
          </div>
          {onOpenHistory && (
            <button type="button" className="savings-cta" onClick={onOpenHistory}>
              Ver mis compras
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

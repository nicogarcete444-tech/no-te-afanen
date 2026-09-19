'use client';

import { useEffect, useRef, useState } from 'react';

// Id fijo del div donde html5-qrcode monta el <video> de la cámara.
const READER_ID = 'barcode-reader';

export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [manualCode, setManualCode] = useState('');
  // any: la librería no trae tipos que anden bien con SSR, y solo la
  // importamos dinámicamente del lado del cliente (ver useEffect de abajo).
  const scannerRef = useRef<any>(null);
  const stoppingRef = useRef(false);

  // onDetected va en un ref, no en las dependencias del efecto de abajo.
  // El padre (StoreApp) redefine esa función en cada render, así que tenerla
  // como dependencia hacía que la cámara se apagara y se volviera a prender
  // sola cada vez que llegaba una tanda de productos — justo mientras la
  // persona intentaba apuntar al código.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    stoppingRef.current = false;
    setStatus('starting');
    setErrorMsg('');

    let cancelled = false;

    async function start() {
      try {
        // Import dinámico: esta librería toca `navigator`/`document` apenas
        // se carga, así que no puede importarse en el bundle de servidor.
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(READER_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            // Los códigos de barra son bien horizontales (mucho más anchos
            // que altos); un recuadro más bajo hace foco en esa franja y
            // deja de perder tiempo escaneando arriba/abajo del código.
            // (Nota: si el navegador tiene la Barcode Detection API nativa
            // — Chrome/Edge en Android y cada vez más en desktop —,
            // Html5Qrcode ya la prefiere automáticamente por sobre su
            // decodificador en JS puro, notablemente más lento; no hace
            // falta pedirlo a mano acá.)
            qrbox: { width: 280, height: 120 },
          },
          (decodedText: string) => {
            // Encontró un código: paramos la cámara y avisamos para arriba.
            if (stoppingRef.current) return;
            stoppingRef.current = true;
            scanner
              .stop()
              .catch(() => {})
              .finally(() => {
                onDetectedRef.current(decodedText.trim());
              });
          },
          () => {
            // Callback de "no se detectó nada en este frame": es normal,
            // se dispara todo el tiempo mientras apunta la cámara. Se ignora.
          }
        );
        if (!cancelled) setStatus('scanning');
      } catch (err: any) {
        if (cancelled) return;
        setStatus('error');
        setErrorMsg(
          err?.name === 'NotAllowedError'
            ? 'No nos diste permiso para usar la cámara. Habilitalo en el navegador o escribí el código a mano.'
            : 'No pudimos abrir la cámara en este dispositivo. Podés escribir el código a mano.'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      if (scanner && !stoppingRef.current) {
        stoppingRef.current = true;
        scanner.stop().catch(() => {}).finally(() => {
          scanner.clear?.();
        });
      }
    };
  }, [open]);

  if (!open) return null;

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (code) onDetectedRef.current(code);
  }

  return (
    <div className="scan-overlay" onClick={onClose}>
      <div className="scan-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="scan-head">
          <h3>Escanear código de barras</h3>
          <button className="cart-sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="scan-camera-wrap">
          <div id={READER_ID} className="scan-camera" />
          {status === 'starting' && <div className="scan-hint">Iniciando cámara…</div>}
          {status === 'scanning' && (
            <div className="scan-hint">Apuntá al código de barras del producto</div>
          )}
        </div>

        {status === 'error' && <div className="scan-error">{errorMsg}</div>}

        <form className="scan-manual" onSubmit={handleManualSubmit}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="O escribí el código de barras acá"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button type="submit" className="cta-btn secondary">Buscar</button>
        </form>
      </div>
    </div>
  );
}

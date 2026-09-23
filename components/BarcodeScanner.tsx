'use client';

import { useEffect, useRef, useState } from 'react';

// Id fijo del div donde html5-qrcode monta el <video> de la cámara.
const READER_ID = 'barcode-reader';

// Red de seguridad, aparte de lo que haga la librería: apaga a mano
// cualquier track de cámara que haya quedado vivo en el <video> que
// html5-qrcode inserta adentro de #READER_ID.
//
// Por qué hace falta esto además de scanner.stop(): si el escáner se cierra
// (se toca la ×, se cambia de pestaña del nav inferior) MIENTRAS
// scanner.start() todavía no terminó de resolver, llamar a stop() en ese
// momento tira error adentro de html5-qrcode y no llega a liberar el
// getUserMedia que ya pidió — la lucecita de la cámara se queda prendida
// aunque la hoja del escáner ya haya desaparecido de la pantalla. Buscando
// el <video> directo y parando sus tracks a mano, el hardware se libera sí o
// sí, gane o pierda esa carrera con la librería.
function releaseAnyActiveCamera() {
  const video = document.querySelector<HTMLVideoElement>(`#${READER_ID} video`);
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video) video.srcObject = null;
}

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
  // Promesa de scanner.start() en curso. El cleanup la espera antes de
  // llamar a stop() — ver releaseAnyActiveCamera de arriba para el motivo.
  const startingRef = useRef<Promise<unknown> | null>(null);

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

        const startPromise = scanner.start(
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
                releaseAnyActiveCamera();
                onDetectedRef.current(decodedText.trim());
              });
          },
          () => {
            // Callback de "no se detectó nada en este frame": es normal,
            // se dispara todo el tiempo mientras apunta la cámara. Se ignora.
          }
        );
        startingRef.current = startPromise;
        await startPromise;
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
      // Si se cierra apenas abierto, scanner.start() puede seguir en vuelo:
      // esperamos a que termine (bien o mal) antes de pedirle a la librería
      // que pare — llamar a stop() con start() todavía pendiente es lo que
      // dejaba la cámara prendida. releaseAnyActiveCamera corre siempre al
      // final, pase lo que pase con la librería en el medio.
      (async () => {
        try {
          await startingRef.current;
        } catch {
          // el error de un start() fallido ya lo maneja el catch de arriba;
          // acá solo nos interesa esperar a que termine.
        }
        const scanner = scannerRef.current;
        if (scanner && !stoppingRef.current) {
          stoppingRef.current = true;
          try {
            await scanner.stop();
          } catch {
            // puede tirar si la cámara nunca llegó a arrancar del todo — no
            // importa, releaseAnyActiveCamera de abajo se ocupa igual.
          }
          try {
            scanner.clear?.();
          } catch {
            // no-op: clear() sobre un contenedor ya vacío no rompe nada,
            // pero por las dudas no dejamos que tire arriba del resto.
          }
        }
        releaseAnyActiveCamera();
      })();
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

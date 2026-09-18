'use client';

import { useEffect, useRef, useState } from 'react';
import { recognizeText, terminateOcrWorker } from '@/lib/ocr';
import { guessSearchTermFromOcr } from '@/lib/photoSearchText';

type Status = 'idle' | 'reading' | 'ready' | 'error';

export default function PhotoSearch({
  open,
  onClose,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (term: string) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [guess, setGuess] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Al cerrar el modal volvemos todo a cero y liberamos la cámara/el motor
  // de OCR, para no dejar nada corriendo de fondo ni mostrar la foto vieja
  // la próxima vez que se abra.
  useEffect(() => {
    if (open) return;
    setStatus('idle');
    setPreview(null);
    setGuess('');
    setErrorMsg('');
    terminateOcrWorker();
  }, [open]);

  if (!open) return null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStatus('reading');
    setErrorMsg('');
    try {
      const text = await recognizeText(file);
      const term = guessSearchTermFromOcr(text);
      if (!term) {
        setStatus('error');
        setErrorMsg('No pudimos leer texto claro en la foto. Probá con más luz, más cerca, o escribí el nombre a mano.');
        return;
      }
      setGuess(term);
      setStatus('ready');
    } catch {
      setStatus('error');
      setErrorMsg('No pudimos leer la foto ahora. Probá de nuevo o escribí el nombre a mano.');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = guess.trim();
    if (term) onSearch(term);
  }

  function retry() {
    setStatus('idle');
    setPreview(null);
    setGuess('');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="scan-overlay" onClick={onClose}>
      <div className="scan-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="scan-head">
          <h3>Buscar por foto</h3>
          <button className="cart-sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="photo-search-body">
          {!preview && (
            <label className="photo-search-drop">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8a2 2 0 0 1 2-2h1.2l1-1.6A2 2 0 0 1 10 3.5h4a2 2 0 0 1 1.8.9L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
                <circle cx="12" cy="12.5" r="3.4" />
              </svg>
              <span>Sacá una foto del envase o el cartel del precio</span>
              <span className="photo-search-hint-small">Va a leer la marca y el nombre impresos</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleFile(e.target.files?.[0])}
                hidden
              />
            </label>
          )}

          {preview && (
            <div className="photo-search-preview-wrap">
              <img src={preview} alt="" className="photo-search-preview" />
            </div>
          )}

          {status === 'reading' && <div className="scan-hint photo-search-status">Leyendo la foto…</div>}
          {status === 'error' && <div className="scan-error">{errorMsg}</div>}

          {status === 'ready' && (
            <form className="scan-manual" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Nombre del producto"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                autoFocus
              />
              <button type="submit" className="cta-btn secondary">Buscar</button>
            </form>
          )}

          {(status === 'ready' || status === 'error') && (
            <button className="photo-search-retry" onClick={retry}>Sacar otra foto</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Lectura de texto en una foto (búsqueda por foto), 100% en el navegador de
// la persona: no mandamos la imagen a ningún servidor nuestro ni de
// terceros, así que no hace falta ninguna API key. tesseract.js baja su
// modelo de lenguaje (unos pocos MB, una sola vez, con caché del navegador)
// desde su propio CDN la primera vez que se usa esto — por eso hace falta
// conexión a internet la primera vez que alguien escanea una foto.
let workerPromise: Promise<any> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('spa'));
  }
  return workerPromise;
}

export async function recognizeText(image: File | Blob | string): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return data?.text || '';
}

// Se llama al cerrar el modal de búsqueda por foto: libera el worker en vez
// de dejarlo corriendo en memoria de fondo el resto de la sesión.
export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate().catch(() => {});
}

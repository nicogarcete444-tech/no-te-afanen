import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runPriceSnapshotBatch } from '@/lib/priceSnapshotWorker';

// La tanda recorre hasta 40 productos con pedidos a Precios Claros: con el
// límite por defecto de la función serverless se cortaba a mitad de camino.
export const maxDuration = 60;

// Comparación en tiempo constante. Un `!==` corta apenas encuentra el
// primer byte distinto, así que el tiempo de respuesta filtra cuántos
// caracteres del secreto acertaste y permite adivinarlo de a uno. Acá el
// tiempo no depende del contenido.
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual exige largos iguales; si difieren ya sabemos que no
  // coinciden, y el largo del header lo elige el atacante (no filtra nada
  // del secreto real).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Vercel Cron manda automáticamente "Authorization: Bearer <CRON_SECRET>"
// cuando dispara este endpoint (siempre que CRON_SECRET esté seteado en las
// env vars del proyecto en Vercel). Cualquier otro pedido sin ese header
// exacto se rechaza — sin esto, cualquiera podría gastar la cuota de
// pedidos a Precios Claros llamando a esta URL directamente.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || !authHeader || !secretsMatch(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const result = await runPriceSnapshotBatch();
  return NextResponse.json(result);
}

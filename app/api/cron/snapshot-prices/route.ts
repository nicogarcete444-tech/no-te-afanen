import { NextRequest, NextResponse } from 'next/server';
import { runPriceSnapshotBatch } from '@/lib/priceSnapshotWorker';

// Vercel Cron manda automáticamente "Authorization: Bearer <CRON_SECRET>"
// cuando dispara este endpoint (siempre que CRON_SECRET esté seteado en las
// env vars del proyecto en Vercel). Cualquier otro pedido sin ese header
// exacto se rechaza — sin esto, cualquiera podría gastar la cuota de
// pedidos a Precios Claros llamando a esta URL directamente.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const result = await runPriceSnapshotBatch();
  return NextResponse.json(result);
}

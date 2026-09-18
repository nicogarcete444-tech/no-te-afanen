import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: 'Falta el endpoint.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No hay sesión.' }, { status: 401 });
  }

  // El filtro por user_id no hace falta para la seguridad (RLS ya lo exige),
  // pero evita que alguien borre un endpoint de otra cuenta por error.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ unsubscribed: true });
}

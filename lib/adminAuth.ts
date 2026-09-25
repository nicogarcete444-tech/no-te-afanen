// Quiénes pueden entrar a /admin. Se define por variable de entorno
// (ADMIN_EMAILS, separados por coma) para no tener que tocar código ni
// hacer un deploy nuevo cada vez que querés sumar o sacar a alguien.
//
// A propósito NO tiene el prefijo NEXT_PUBLIC_: solo se lee del lado del
// servidor, nunca llega al navegador.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;

  const admins = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.trim().toLowerCase());
}

// Admin de verdad = email en la lista Y email CONFIRMADO. Sin el segundo
// chequeo, si "Confirm email" está apagado en Supabase (o el admin todavía no
// se registró), cualquiera podía crear una cuenta con ese email y entrar.
// Usar siempre esta función y no isAdminEmail a secas. `user` tiene que venir
// de auth.getUser() (verificado contra Auth), nunca de getSession().
export function isAdminUser(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined
): boolean {
  return !!user?.email_confirmed_at && isAdminEmail(user.email);
}

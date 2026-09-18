// Quiénes pueden entrar a /admin. Se define por variable de entorno
// (ADMIN_EMAILS, separados por coma) para no tener que tocar código ni
// hacer un deploy nuevo cada vez que querés sumar o sacar a alguien.
//
// A propósito NO tiene el prefijo NEXT_PUBLIC_: solo se lee del lado del
// servidor (en app/admin/page.tsx y app/page.tsx), nunca llega al navegador.
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

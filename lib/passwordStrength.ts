export interface PasswordChecks {
  length: boolean; // mínimo 8 caracteres
  mixedCase: boolean; // minúsculas y mayúsculas
  number: boolean; // al menos 1 número
  symbol: boolean; // al menos 1 símbolo
}

// ¿Cumple TODOS los requisitos? Es la función que decide si un registro
// puede seguir. Existe porque hasta acá la checklist que se ve al registrarse
// era puramente decorativa: mostraba cuatro tildes en gris y el formulario
// dejaba crear la cuenta igual con "12345678" (el único freno real era el
// minLength=8 del input, que ni siquiera cubre el caso de pegar la
// contraseña). Mostrarle a alguien una lista de requisitos y después no
// exigirlos es peor que no mostrarla: da una sensación de seguridad que no
// existe.
export function meetsPasswordPolicy(password: string): boolean {
  const checks = getPasswordChecks(password);
  return checks.length && checks.mixedCase && checks.number && checks.symbol;
}

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= 8,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function getPasswordStrength(password: string): {
  score: number; // 0-4
  label: string;
  colorVar: string;
} {
  if (!password) return { score: 0, label: 'Muy débil', colorVar: 'var(--up)' };
  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  switch (score) {
    case 0:
    case 1:
      return { score, label: 'Muy débil', colorVar: 'var(--up)' };
    case 2:
      return { score, label: 'Débil', colorVar: 'var(--gold)' };
    case 3:
      return { score, label: 'Buena', colorVar: 'var(--gold)' };
    default:
      return { score, label: 'Muy fuerte', colorVar: 'var(--down)' };
  }
}

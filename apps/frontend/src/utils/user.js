export function parseMandantFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/@([^\.]+)/);
  return match ? match[1] : '';
}

export function isAdminMandant(mandant) {
  const m = String(mandant || '').trim().toLowerCase();
  return m === 'mlholding' || m === 'filehouse';
}

export function getEffectiveMandant(email) {
  const override = String(import.meta.env.VITE_TEST_MANDANT || '').trim().toLowerCase();
  if (override) return override;
  return parseMandantFromEmail(email);
}

export function isAdminFromEmail(email) {
  const override = String(import.meta.env.VITE_TEST_MANDANT || '').trim();
  if (override) return false;
  return isAdminMandant(parseMandantFromEmail(email));
}

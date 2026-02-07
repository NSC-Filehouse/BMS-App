export function parseMandantFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/@([^\.]+)/);
  return match ? match[1] : '';
}

export function isAdminMandant(mandant) {
  const m = String(mandant || '').trim().toLowerCase();
  return m === 'mlholding' || m === 'filehouse';
}

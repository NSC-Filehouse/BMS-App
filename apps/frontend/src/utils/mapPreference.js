const KEY = 'bms.mapPreference';

export const MAP_PROVIDER_GOOGLE = 'google';
export const MAP_PROVIDER_APPLE = 'apple';

export function getMapPreference() {
  try {
    const value = localStorage.getItem(KEY);
    return value === MAP_PROVIDER_APPLE || value === MAP_PROVIDER_GOOGLE ? value : '';
  } catch {
    return '';
  }
}

export function setMapPreference(value) {
  const next = value === MAP_PROVIDER_APPLE ? MAP_PROVIDER_APPLE : MAP_PROVIDER_GOOGLE;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // ignore
  }
  return next;
}

export function buildMapUrl(provider, address) {
  const encoded = encodeURIComponent(String(address || '').trim());
  if (!encoded) return '';
  if (provider === MAP_PROVIDER_APPLE) {
    return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

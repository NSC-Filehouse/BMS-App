const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function deliveryAddressStorageKey(userId, mandant, customerId) {
  return `bms.deliveryAddress.pending.${[userId, mandant, customerId].map((value) => encodeURIComponent(String(value))).join('.')}`;
}
export function readDeliveryAddressPending(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return UUID.test(value?.id || '') && value?.body && typeof value.body === 'object' && !Array.isArray(value.body) ? value : null;
  } catch { return null; }
}
export function buildDeliveryAddressDraft(input) {
  return Object.fromEntries(['street', 'postalCode', 'city', 'countryId', 'contact', 'pickupTimes']
    .map((field) => [field, String(input?.[field] || '').trim()]));
}
export function deliveryAddressContextMatches(scope, current) {
  return Boolean(scope && current && scope.customerId === current.customerId && scope.mandant === current.mandant);
}
export function keepDeliveryAddressPending(failure) {
  // Only a terminal result from the operation history proves no address was
  // created. Permission/network/refresh failures cannot resolve an earlier send.
  return failure?.payload?.error?.details?.state !== 'failed';
}
export function resolveDeliveryAddressSelection(addresses, id, text) {
  const selectedId = String(id ?? '').trim();
  if (selectedId) return addresses.find((address) => String(address.id) === selectedId) || null;
  const matches = addresses.filter((address) => String(address.text || '').trim() === String(text || '').trim());
  return matches.length === 1 ? matches[0] : null;
}

function incotermCode(value) {
  return String(value ?? '').trim().match(/^([a-z]{3})(?![a-z])/i)?.[1].toUpperCase() || '';
}

export function findIncotermByCode(options, value) {
  const code = incotermCode(value);
  if (!code) return null;
  const matches = options.filter(option => incotermCode(option.text) === code);
  return matches.length === 1 ? matches[0] : null;
}

export function findDefaultIncoterm(options) {
  return findIncotermByCode(options, 'CPT');
}

export function isFcaIncoterm(value) {
  return incotermCode(value) === 'FCA';
}

export function findOptionOfferIncoterm(options) {
  return options.find(option => incotermCode(option.text) === 'CFR') ?? null;
}

const emptyAddress = () => ({ deliveryAddress: '', deliveryAddressId: '', deliveryAddressManual: false, deliveryAddressNewlyCreated: false });
const addressFields = (form) => ({
  deliveryAddress: form.deliveryAddress || '',
  deliveryAddressId: form.deliveryAddressId ?? '',
  deliveryAddressManual: Boolean(form.deliveryAddressManual),
  deliveryAddressNewlyCreated: Boolean(form.deliveryAddressNewlyCreated),
});

export function normalizePickupFormAddress(form) {
  const isPickupSnapshot = form.deliveryAddressManual && String(form.deliveryAddressId ?? '') === '';
  return { ...form, deliveryAddress: isPickupSnapshot ? form.deliveryAddress : '', deliveryAddressId: '', deliveryAddressManual: true, deliveryAddressNewlyCreated: false };
}

export function applyPickupSuggestion(form, suggestion, previousSuggestion) {
  if (!isFcaIncoterm(form.incotermText)) return form;
  const normalized = normalizePickupFormAddress(form);
  if (normalized.deliveryAddress && normalized.deliveryAddress !== previousSuggestion) return normalized;
  return { ...normalized, deliveryAddress: suggestion || '' };
}

export function switchOrderIncoterm(form, option, cache, contextKey) {
  const next = { ...form, incotermId: option?.id ?? '', incotermText: option?.text || '' };
  const wasPickup = isFcaIncoterm(form.incotermText);
  const becomesPickup = isFcaIncoterm(next.incotermText);
  if (wasPickup === becomesPickup) return { form: next, cache };
  if (becomesPickup) {
    return {
      form: { ...next, ...emptyAddress(), ...(cache.pickup?.contextKey === contextKey ? cache.pickup.address : {}), deliveryAddressManual: true },
      cache: { ...cache, delivery: { customerId: form.clientReferenceId, address: addressFields(form) } },
    };
  }
  return {
    form: { ...next, ...emptyAddress(), ...(cache.delivery?.customerId === form.clientReferenceId ? cache.delivery.address : {}) },
    cache: { ...cache, pickup: { contextKey, address: addressFields(form) } },
  };
}

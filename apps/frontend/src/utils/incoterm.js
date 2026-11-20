export function isFcaIncoterm(value) {
  return /^FCA(?:$|[^A-Z])/i.test(String(value || '').trim());
}

function findIncotermByText(value, options) {
  const normalize = text => String(text || '').trim().toUpperCase();
  const label = normalize(value);
  if (!label) return null;
  const exact = options.filter(option => normalize(option.text) === label);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const codeOf = text => normalize(text).match(/^([A-Z]{3})(?:$|[\s/\-])/)?.[1];
  const code = codeOf(label);
  if (!code) return null;
  const codesInLabel = label.match(/\b[A-Z]{3}\b/g) ?? [];
  if (options.some(option => codeOf(option.text) !== code && codesInLabel.includes(codeOf(option.text)))) return null;
  const matches = options.filter(option => codeOf(option.text) === code);
  return matches.length === 1 ? matches[0] : null;
}

export function findOptionOfferIncoterm(optionIncoterm, lastPurchaseIncoterm, options) {
  return findIncotermByText(optionIncoterm, options) ?? findIncotermByText(lastPurchaseIncoterm, options);
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

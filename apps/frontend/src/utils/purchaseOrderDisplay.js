export function formatPurchaseDate(value) {
  if (!value) return '–';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '–' : date.toLocaleDateString('de-DE');
}

export function formatPurchaseNumber(value) {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number) ? '–' : number.toLocaleString('de-DE', { maximumFractionDigits: 3 });
}

export function formatPurchasePrice(value, currency = 'EUR') {
  const number = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(number) ? '–' : `${number.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}/t`;
}

export function purchaseOrderListReturnTo(state) {
  const pending = [state?.afterSaveReturnTo, state?.returnTo].filter(Boolean);
  const seen = new Set();
  while (pending.length) {
    const target = pending.shift();
    if (seen.has(target)) continue;
    seen.add(target);
    if (target.pathname === '/temp-purchase-orders') return target;
    if (target.state?.afterSaveReturnTo) pending.push(target.state.afterSaveReturnTo);
    if (target.state?.returnTo) pending.push(target.state.returnTo);
  }
  return { pathname: '/temp-purchase-orders', state: state?.listState ? { listState: state.listState } : null };
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function calculateAvailableCredit({ amount, unpaidInvoicesAmount = 0, openOrdersAmount = 0 }) {
  const hasLimit = amount !== null && amount !== undefined && String(amount).trim() !== '';
  const limit = hasLimit ? Number(amount) : null;
  const unpaidInvoices = toAmount(unpaidInvoicesAmount);
  const openOrders = toAmount(openOrdersAmount);

  return {
    amount: Number.isFinite(limit) ? limit : null,
    unpaidInvoicesAmount: unpaidInvoices,
    openOrdersAmount: openOrders,
    availableAmount: Number.isFinite(limit)
      ? limit - unpaidInvoices - openOrders
      : null,
  };
}

module.exports = { calculateAvailableCredit };

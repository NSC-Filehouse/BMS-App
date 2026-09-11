const PURCHASE_ORDER_MAIL_SUBJECT = 'BMS-App Bestellung an Lieferant';
const PURCHASE_ORDER_CS_MAIL_SUBJECT = 'BMS-App: neue Bestellung für CS';

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function date(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? text(value) || '-' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' }).format(d);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 3 }) : '-';
}

function line(label, value) {
  return `${label}: ${text(value) || '-'}`;
}

function formatPurchaseOrderMailBody({ order, positions, mandantName, mandantShortName, audience = 'supplier' }) {
  const lines = [
    audience === 'cs'
      ? 'In der BMS-App wurde eine neue Bestellung an einen Lieferanten finalisiert.'
      : 'In der BMS-App wurde eine Bestellung an Sie freigegeben.',
    '',
    'BESTELLUNG',
    line('BMS-App Bestell-ID', order?.id),
    line('BMS-Bestellnummer', order?.bmsPurchaseOrderNumber),
    line('Mandant', [mandantName, mandantShortName ? `(${mandantShortName})` : ''].filter(Boolean).join(' ')),
    line('Lieferant', order?.supplierName),
    line('Lieferantennummer', order?.supplierId),
    line('Ansprechpartner', order?.supplierContact),
    line('Zahlungsbedingung', order?.paymentConditionText || order?.paymentConditionId),
    line('Lieferbedingung', order?.deliveryTermText),
    line('Ladeort', order?.loadingLocationText),
    line('Verpackung', order?.packagingType),
    line('Sonstiges', order?.comment),
    '',
    `POSITIONEN (${Array.isArray(positions) ? positions.length : 0})`,
  ];
  (Array.isArray(positions) ? positions : []).forEach((position, index) => {
    lines.push(
      '',
      `Position ${position?.lineNo || index + 1}`,
      line('Material', position?.article),
      line('Artikelindex', position?.articleIndex),
      line('Menge', `${number(position?.amount)} ${text(position?.unit) || 'kg'}`),
      line('EK', `${number(position?.purchasePrice)} ${text(position?.currency) || 'EUR'}`),
      line('Gewünschter Liefertermin', date(position?.requestedDeliveryDate)),
      line('Reserviert für', position?.reservedFor),
      line('Positionshinweis', position?.comment),
      line('Vorherige BE', position?.sourceBestellindex),
    );
  });
  return lines.join('\r\n');
}

function formatPurchaseOrderCsMailBody(args) {
  return formatPurchaseOrderMailBody({ ...args, audience: 'cs' });
}

module.exports = {
  PURCHASE_ORDER_MAIL_SUBJECT,
  PURCHASE_ORDER_CS_MAIL_SUBJECT,
  formatPurchaseOrderMailBody,
  formatPurchaseOrderCsMailBody,
};

const PURCHASE_ORDER_CS_MAIL_SUBJECT = 'BMS-App: neue Bestellung für BMS';

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

function formatPurchaseOrderCsMailBody({ order, positions, mandantName, mandantShortName }) {
  const lines = [
    'In der BMS-App wurde eine neue Bestellung an einen Lieferanten finalisiert.',
    '',
    'BESTELLUNG',
    line('BMS-App Bestell-ID', order?.id),
    line('BMS-Bestellnummer', order?.bmsPurchaseOrderNumber),
    line('Mandant', [mandantName, mandantShortName ? `(${mandantShortName})` : ''].filter(Boolean).join(' ')),
    line('Lieferant', order?.supplierName),
    line('Lieferantennummer', order?.supplierId),
    line('Ansprechpartner', order?.supplierContact),
    ...(order?.supplierContactId ? [line('Ansprechpartner-ID', order.supplierContactId)] : []),
    line('Zahlungsbedingung', order?.paymentConditionText || order?.paymentConditionId),
    line('Lieferbedingung', order?.deliveryTermText),
    ...(order?.warehouseId ? [line('Lager', order.warehouseId)] : []),
    line(order?.addressId ? 'Liefer-/Abholadresse' : 'Ladeort', order?.loadingLocationText),
    ...(order?.addressId ? [line('Adress-Kundennummer', order.addressCustomerId), line('Lieferadress-ID', order.addressId)] : []),
    ...(order?.reference ? [line('Referenz', order.reference)] : []),
    line('Währung', order?.currency || positions?.[0]?.currency || 'EUR'),
    line('Verpackung', order?.packagingType),
    line('Sonstiges', order?.comment),
    line('Anhang', order?.attachments?.length ? order.attachments.map((attachment) => attachment.fileName).join(', ') : 'Kein Anhang'),
    '',
    `POSITIONEN (${Array.isArray(positions) ? positions.length : 0})`,
  ];
  (Array.isArray(positions) ? positions : []).forEach((position, index) => {
    lines.push(
      '',
      `Position ${position?.lineNo || index + 1}`,
      line('Material', position?.article),
      line('Artikelindex', position?.articleIndex),
      ...(position?.optionId != null ? [line('Option-ID',position.optionId),line('Optionsposition',position.optionPositionId)] : []),
      line('Menge', `${number(position?.amount)} ${text(position?.unit) || 'kg'}`),
      line('EK', `${number(position?.purchasePrice)} ${text(order?.currency || position?.currency) || 'EUR'}`),
      ...(position?.placeAtSupplier ? [line('Lager bei Strecke', position.placeAtSupplier)] : []),
      ...(position?.pickupReference ? [line('Abholreferenz', position.pickupReference)] : []),
      ...(position?.availabilityNote ? [line('Bemerkung für die Verfügbarkeitsliste', position.availabilityNote)] : []),
      line('Gewünschter Liefertermin', date(position?.requestedDeliveryDate)),
      line('Reserviert für', position?.reservedFor),
      line('Positionshinweis', position?.comment),
      line('Ursprüngliche Verpackung', position?.originalPackagingType || order?.packagingType),
      line('Verpackung geändert', position?.packagingTypeChanged ? 'Ja' : 'Nein'),
    );
  });
  return lines.join('\r\n');
}

module.exports = {
  PURCHASE_ORDER_CS_MAIL_SUBJECT,
  formatPurchaseOrderCsMailBody,
};

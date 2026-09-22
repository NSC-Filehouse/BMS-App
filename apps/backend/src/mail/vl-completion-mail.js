const VL_COMPLETION_MAIL_SUBJECT = '@BMS-App Verkauf';
const {
  formatMfiValue,
  sortVlItems,
} = require('../mfi-sort');

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, digits = 0, locale = 'de-DE') {
  const number = asNumber(value);
  if (number === null) return '-';
  return number.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function classicLineParts(item) {
  const amount = formatNumber(item?.amount, 0);
  const unit = asText(item?.unit);
  const article = asText(item?.article);
  const mfiValue = item?.mfiMeasured ?? item?.mfi;
  const mfi = formatMfiValue(mfiValue);
  const method = asText(item?.mfiTestMethod);
  const price = formatEuroPrice(item?.acquisitionPrice);
  const warehouse = asText(item?.warehouse);
  const beNumber = asText(item?.beNumber);
  const remark = asText(item?.about);

  let main = `${amount} ${unit} ${article}`.trim();
  if (mfi) {
    main += ` MFI ${mfi}`;
    if (method) main += ` (${method})`;
  }
  if (price) main += ` zu ${price}`;
  if (warehouse) main += ` ex ${warehouse}`;
  if (beNumber) main += ` ${beNumber}`;

  return { main, remark };
}

function classicGroupTitle(item) {
  return `${asText(item?.plastic) || 'unbekannt'}-${asText(item?.plasticSubCategory) || 'unbekannt'}`;
}

function formatCompactQuantity(value) {
  const number = asNumber(value);
  if (number === null) return '-';
  return number.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function splitIncoterms(value) {
  return asText(value)
    .split(/\s*\/\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedIncotermParts(value) {
  return splitIncoterms(value)
    .filter((item) => item.toLocaleLowerCase('de-DE') !== 'frachtfrei')
    .map((item) => item.slice(0, 3).toUpperCase())
    .filter(Boolean);
}

function normalizeIncoterm(value) {
  return normalizedIncotermParts(value).join(' / ');
}

function getPositionIncoterm(position, orderDeliveryType, index) {
  const ownIncoterm = normalizeIncoterm(position?.incoterm || position?.incotermText || position?.deliveryType);
  if (ownIncoterm) return ownIncoterm;

  const orderIncoterms = normalizedIncotermParts(orderDeliveryType);
  if (!orderIncoterms.length) return '';
  return orderIncoterms.length > 1
    ? (orderIncoterms[index] || orderIncoterms[orderIncoterms.length - 1])
    : orderIncoterms[0];
}

function formatPositionPrice(value) {
  const number = asNumber(value);
  return number === null ? (asText(value) || '-') : formatEuroPrice(number, 0);
}

function formatEuroPrice(value, digits = 0) {
  const number = asNumber(value);
  return number === null ? (asText(value) || '-') : `${formatNumber(number, digits)}€`;
}

function formatDeliveryMonthYear(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    month: 'long',
    year: 'numeric',
  }).format(date).replace(/\s+/g, '/');
}

function renderSaleRows(positions, orderDeliveryType) {
  const list = Array.isArray(positions) ? positions : [];
  if (!list.length) {
    return '<div style="margin:4px 0;color:#546e7a;">No sold positions available.</div>';
  }

  return list.map((position, index) => {
    const amount = formatCompactQuantity(position?.amountInKg);
    const unit = asText(position?.unit) || 'KG';
    const article = asText(position?.article) || '-';
    const beNumber = asText(position?.beNumber);
    const details = beNumber;
    const remark = asText(position?.about || position?.remark || position?.comment);
    const salePrice = formatPositionPrice(position?.price);
    const incoterm = getPositionIncoterm(position, orderDeliveryType, index);
    const costPrice = formatPositionPrice(position?.costPrice);
    const deliveryDate = formatDeliveryMonthYear(position?.deliveryDate);
    const positionText = `${salePrice}${incoterm ? ` ${incoterm}` : ''} ${amount} ${unit} ${article}${details ? ` - ${details}` : ''} - EP ${costPrice}`;

    return `<div style="margin:0;padding:1px 0;line-height:1.35;word-break:break-word;">
      ${escapeHtml(positionText)}
      ${remark ? `<span style="color:#ff0000;font-weight:700;"> - ${escapeHtml(remark)}</span>` : ''}
      ${deliveryDate ? `<span style="color:#0000ff;"> - ${escapeHtml(deliveryDate)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderClassicVl(vlItems) {
  const list = sortVlItems(vlItems);
  if (!list.length) {
    return '<p style="margin:0;color:#546e7a;">Die aktuelle VL enthält keine verfügbaren Positionen.</p>';
  }

  let lastGroup = '';
  return list.map((item) => {
    const group = classicGroupTitle(item);
    const showGroup = group !== lastGroup;
    lastGroup = group;
    const parts = classicLineParts(item);
    const groupHtml = showGroup
      ? `<div style="margin:14px 0 4px;font-weight:700;font-size:14px;color:#212121;">${escapeHtml(group)}</div>`
      : '';
    const remarkHtml = parts.remark
      ? ` <span style="color:#ff0000;font-weight:700;">- ${escapeHtml(parts.remark)}</span>`
      : '';
    return `${groupHtml}<div style="padding:0 0 0 9px;line-height:1.35;word-break:break-word;">${escapeHtml(parts.main)}${remarkHtml}</div>`;
  }).join('');
}

function formatVlCompletionMailBody({ order, positions, vlItems, mandantName, mandantShortName, completedAt }) {
  const safeMandant = asText(mandantShortName) || asText(mandantName) || '-';
  const list = Array.isArray(positions) ? positions : [];
  const customer = asText(order?.clientName) || '-';
  const sellerShortCode = asText(order?.salesRepresentativeShortCode) || asText(order?.createdBy);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:8px;background:#ffffff;color:#000000;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.35;">
    <div style="width:100%;">
      <div style="margin:0 0 8px;">${sellerShortCode ? `<span style="color:#000000;font-weight:700;">${escapeHtml(sellerShortCode)}</span> ` : ''}<span style="color:#ff0000;font-weight:700;">sold</span> to <span style="color:#ff0000;font-weight:700;">${escapeHtml(customer)}</span></div>
      <div style="margin:0 0 14px;">${renderSaleRows(list, order?.deliveryType)}</div>

      <div style="margin:0 0 8px;padding:2px 4px;background:#000000;color:#ffffff;">${escapeHtml(safeMandant)} - Verfügbare Mengen Neu</div>
      <div style="padding-left:4px;">${renderClassicVl(vlItems)}</div>
    </div>
  </body>
</html>`;
}

module.exports = {
  VL_COMPLETION_MAIL_SUBJECT,
  formatVlCompletionMailBody,
  classicLineParts,
  sortVlItems,
};

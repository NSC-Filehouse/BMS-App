const VL_COMPLETION_MAIL_SUBJECT = 'BMS-App Verkauf';

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

function formatDate(value, withTime = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return asText(value) || '-';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function formatNumber(value, digits = 0, locale = 'de-DE') {
  const number = asNumber(value);
  if (number === null) return '-';
  return number.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatEnglishNumber(value, digits = 0) {
  return formatNumber(value, digits, 'en-GB');
}

function formatMargin(value) {
  const salePrice = asNumber(value?.price);
  const costPrice = asNumber(value?.costPrice);
  if (salePrice === null || costPrice === null || costPrice === 0) return '-';
  const margin = ((salePrice - costPrice) / costPrice) * 100;
  return `${formatEnglishNumber(margin, 2)} %`;
}

function marginColor(value) {
  const salePrice = asNumber(value?.price);
  const costPrice = asNumber(value?.costPrice);
  if (salePrice === null || costPrice === null || costPrice === 0) return '#455a64';
  return salePrice >= costPrice ? '#2e7d32' : '#c62828';
}

function classicLineParts(item) {
  const amount = formatNumber(item?.amount, 0);
  const unit = asText(item?.unit);
  const article = asText(item?.article);
  const mfiValue = item?.mfiMeasured ?? item?.mfi;
  const mfiNumber = asNumber(mfiValue);
  const mfi = mfiNumber === null ? '' : formatNumber(mfiNumber, 2).replace(/,00$/, '');
  const method = asText(item?.mfiTestMethod);
  const price = asNumber(item?.acquisitionPrice) === null
    ? asText(item?.acquisitionPrice)
    : formatNumber(item.acquisitionPrice, 0);
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

function renderSaleRows(positions) {
  const list = Array.isArray(positions) ? positions : [];
  if (!list.length) {
    return '<tr><td colspan="6" style="padding:8px;border:1px solid #d7dee2;color:#546e7a;">No sold positions available.</td></tr>';
  }

  return list.map((position, index) => {
    const margin = formatMargin(position);
    return `<tr>
      <td style="padding:8px;border:1px solid #d7dee2;">${escapeHtml(position?.article || '-')}</td>
      <td style="padding:8px;border:1px solid #d7dee2;white-space:nowrap;">${escapeHtml(position?.beNumber || '-')}</td>
      <td style="padding:8px;border:1px solid #d7dee2;text-align:right;white-space:nowrap;">${escapeHtml(formatEnglishNumber(position?.amountInKg, 2))} ${escapeHtml(position?.unit || 'KG')}</td>
      <td style="padding:8px;border:1px solid #d7dee2;text-align:right;white-space:nowrap;">${escapeHtml(formatEnglishNumber(position?.price, 2))} EUR/kg</td>
      <td style="padding:8px;border:1px solid #d7dee2;text-align:right;white-space:nowrap;">${escapeHtml(formatEnglishNumber(position?.costPrice, 2))} EUR/kg</td>
      <td style="padding:8px;border:1px solid #d7dee2;text-align:right;white-space:nowrap;color:${marginColor(position)};font-weight:700;">${escapeHtml(margin)}</td>
    </tr>`;
  }).join('');
}

function renderClassicVl(vlItems) {
  const list = Array.isArray(vlItems) ? vlItems : [];
  if (!list.length) {
    return '<p style="margin:0;color:#546e7a;">Die aktuelle VL enthält keine verfügbaren Positionen.</p>';
  }

  let lastGroup = '';
  return list.map((item, index) => {
    const group = classicGroupTitle(item);
    const showGroup = group !== lastGroup;
    lastGroup = group;
    const parts = classicLineParts(item);
    const rowBackground = index % 2 === 0 ? '#f5f5f5' : '#ffffff';
    const groupHtml = showGroup
      ? `<div style="margin:14px 0 4px;font-weight:700;font-size:14px;color:#212121;">${escapeHtml(group)}</div>`
      : '';
    const remarkHtml = parts.remark
      ? ` <span style="color:#d32f2f;">- ${escapeHtml(parts.remark)}</span>`
      : '';
    return `${groupHtml}<div style="padding:7px 9px;background:${rowBackground};line-height:1.35;word-break:break-word;">${escapeHtml(parts.main)}${remarkHtml}</div>`;
  }).join('');
}

function formatVlCompletionMailBody({ order, positions, vlItems, mandantName, mandantShortName, completedAt }) {
  const safeMandant = [mandantName, mandantShortName ? `(${mandantShortName})` : ''].filter(Boolean).join(' ') || '-';
  const list = Array.isArray(positions) ? positions : [];
  const customer = asText(order?.clientName) || '-';
  const customerNumber = asText(order?.clientReferenceId) || '-';
  const orderId = asText(order?.id) || '-';
  const completedBy = asText(order?.completedBy) || '-';
  const completedAtText = formatDate(completedAt || order?.lastModifiedDate, true);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:20px;background:#ffffff;color:#263238;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;">
    <div style="max-width:1100px;margin:0 auto;">
      <h2 style="margin:0 0 16px;color:#1976d2;font-size:22px;">BMS-App Verkauf</h2>

      <div style="padding:14px 16px;border:1px solid #bbdefb;border-left:5px solid #1976d2;background:#f5faff;">
        <h3 style="margin:0 0 10px;color:#0d47a1;font-size:17px;">Sale completed</h3>
        <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(customer)} (${escapeHtml(customerNumber)})</p>
        <p style="margin:4px 0;"><strong>Mandant:</strong> ${escapeHtml(safeMandant)}</p>
        <p style="margin:4px 0;"><strong>BMS-App order:</strong> ${escapeHtml(orderId)}</p>
        <p style="margin:4px 0;"><strong>Completed by:</strong> ${escapeHtml(completedBy)}</p>
        <p style="margin:4px 0 12px;"><strong>Completed at:</strong> ${escapeHtml(completedAtText)}</p>

        <table style="width:100%;border-collapse:collapse;background:#ffffff;">
          <thead>
            <tr style="background:#e3f2fd;color:#0d47a1;">
              <th style="padding:8px;border:1px solid #d7dee2;text-align:left;">Article</th>
              <th style="padding:8px;border:1px solid #d7dee2;text-align:left;">BE number</th>
              <th style="padding:8px;border:1px solid #d7dee2;text-align:right;">Quantity</th>
              <th style="padding:8px;border:1px solid #d7dee2;text-align:right;">Sale price</th>
              <th style="padding:8px;border:1px solid #d7dee2;text-align:right;">Cost price</th>
              <th style="padding:8px;border:1px solid #d7dee2;text-align:right;">Margin</th>
            </tr>
          </thead>
          <tbody>${renderSaleRows(list)}</tbody>
        </table>
      </div>

      <div style="height:24px;"></div>
      <div style="border-top:2px solid #90a4ae;padding-top:14px;">
        <h3 style="margin:0 0 4px;color:#212121;font-size:17px;">Aktuelle VL (klassische Ansicht)</h3>
        <p style="margin:0 0 8px;color:#546e7a;font-size:12px;">Vollständiger aktueller Stand nach Übernahme des Verkaufs in das ERP.</p>
        <div>${renderClassicVl(vlItems)}</div>
      </div>
    </div>
  </body>
</html>`;
}

module.exports = {
  VL_COMPLETION_MAIL_SUBJECT,
  formatMargin,
  formatVlCompletionMailBody,
  classicLineParts,
};

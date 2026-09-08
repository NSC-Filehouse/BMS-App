const MFI_NUMBER_PATTERN = /[-+]?\d+(?:[.,]\d+)?/;
const MFI_RANGE_SEPARATOR_PATTERN = /[–—−]/g;
const textCollator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseDirectNumber(value) {
  const text = asText(value);
  if (!text) return null;
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/**
 * MFI values are stored as text in some BMS databases. For ranges such as
 * "2-3,99" the lower/first numeric bound is the natural ascending sort key.
 */
function getMfiSortValue(value) {
  const direct = parseDirectNumber(value);
  if (direct !== null) return direct;

  const normalized = asText(value).replace(MFI_RANGE_SEPARATOR_PATTERN, '-');
  const match = normalized.match(MFI_NUMBER_PATTERN);
  if (!match) return null;

  const number = Number(match[0].replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function normalizeMfiValue(value) {
  const text = asText(value);
  if (!text) return null;
  return parseDirectNumber(text) ?? text;
}

function getMfiValue(item) {
  return item?.mfiMeasured ?? item?.mfi;
}

function formatMfiValue(value) {
  const text = asText(value);
  if (!text) return '';
  const number = parseDirectNumber(text);
  if (number === null) return text;
  return number.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function compareMfiValues(left, right) {
  const leftValue = getMfiSortValue(left);
  const rightValue = getMfiSortValue(right);

  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return leftValue - rightValue;
  }

  return textCollator.compare(asText(left), asText(right));
}

function compareText(left, right) {
  return textCollator.compare(asText(left), asText(right));
}

function compareVlItems(left, right) {
  const groupCompare = compareText(
    `${asText(left?.plastic)}\u0000${asText(left?.plasticSubCategory)}`,
    `${asText(right?.plastic)}\u0000${asText(right?.plasticSubCategory)}`,
  );
  if (groupCompare !== 0) return groupCompare;

  const mfiCompare = compareMfiValues(getMfiValue(left), getMfiValue(right));
  if (mfiCompare !== 0) return mfiCompare;

  for (const field of ['article', 'warehouse', 'beNumber', 'id']) {
    const compare = compareText(left?.[field], right?.[field]);
    if (compare !== 0) return compare;
  }
  return 0;
}

function compareVlPositions(left, right) {
  const mfiCompare = compareMfiValues(getMfiValue(left), getMfiValue(right));
  if (mfiCompare !== 0) return mfiCompare;

  for (const field of ['article', 'warehouse', 'beNumber', 'id']) {
    const compare = compareText(left?.[field], right?.[field]);
    if (compare !== 0) return compare;
  }
  return 0;
}

function sortVlItems(items) {
  return (Array.isArray(items) ? items : []).slice().sort(compareVlItems);
}

function sortVlPositions(items) {
  return (Array.isArray(items) ? items : []).slice().sort(compareVlPositions);
}

module.exports = {
  compareMfiValues,
  compareVlItems,
  compareVlPositions,
  formatMfiValue,
  getMfiSortValue,
  normalizeMfiValue,
  sortVlItems,
  sortVlPositions,
};

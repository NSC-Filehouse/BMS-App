const fs = require('fs');
const path = require('path');
const config = require('./config');

const ORDER_NUMBER_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]+$/;

function getConfiguredBaseFilePath() {
  return config.documents.baseFilePathServer || config.documents.baseFilePath || '';
}

function normalizePathSegment(value, fieldName) {
  const segment = String(value || '').trim();
  if (!segment || segment === '.' || segment === '..' || !ORDER_NUMBER_PATTERN.test(segment)) {
    const error = new Error(`Invalid ${fieldName}.`);
    error.code = 'INVALID_ORDER_PDF_PATH_SEGMENT';
    throw error;
  }
  return segment;
}

function buildDocumentPdfDirectory({ baseFilePath, companyName, orderNumber, documentFolder }) {
  let base = String(baseFilePath || '').trim();
  // dotenv values such as `N:` are valid mapped-drive roots in the existing
  // deployment configuration but are drive-relative to Node's win32 path API.
  if (/^[A-Za-z]:$/.test(base)) base = `${base}\\`;
  if (!base || !path.win32.isAbsolute(base)) return null;

  const safeCompanyName = normalizePathSegment(companyName, 'company name');
  const safeOrderNumber = normalizePathSegment(orderNumber, 'order number');
  const safeDocumentFolder = normalizePathSegment(documentFolder, 'document folder');
  return path.win32.join(
    base,
    'Datenbanken',
    safeCompanyName,
    'BMS_Dokumente',
    safeDocumentFolder,
    safeOrderNumber,
  );
}

function buildOrderPdfDirectory({ baseFilePath, companyName, orderNumber }) {
  return buildDocumentPdfDirectory({
    baseFilePath,
    companyName,
    orderNumber,
    documentFolder: '03 Auftrag',
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTimestampedAbFile(entries, orderNumber) {
  const escapedOrderNumber = escapeRegExp(orderNumber);
  const pattern = new RegExp(`^${escapedOrderNumber}_AB_(\\d{8})_(\\d{6})\\.pdf$`, 'i');
  return entries
    .filter((entry) => entry && entry.isFile && entry.isFile())
    .map((entry) => {
      const match = entry.name.match(pattern);
      if (!match) return null;
      return {
        fileName: entry.name,
        timestamp: `${match[1]}${match[2]}`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.timestamp.localeCompare(left.timestamp)
      || right.fileName.localeCompare(left.fileName)
    ))[0] || null;
}

async function resolveLatestOrderPdf({ companyName, orderNumber, baseFilePath = getConfiguredBaseFilePath() } = {}) {
  const directory = buildOrderPdfDirectory({ baseFilePath, companyName, orderNumber });
  if (!directory) return null;

  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null;
    throw error;
  }

  const match = findTimestampedAbFile(entries, String(orderNumber).trim());
  return match
    ? { fileName: match.fileName, filePath: path.win32.join(directory, match.fileName) }
    : null;
}

async function resolveLatestPurchaseOrderPdf({ companyName, orderNumber, baseFilePath = getConfiguredBaseFilePath() } = {}) {
  const directory = buildDocumentPdfDirectory({
    baseFilePath,
    companyName,
    orderNumber,
    documentFolder: '02 Bestellung',
  });
  if (!directory) return null;

  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null;
    throw error;
  }

  const prefix = `${String(orderNumber).trim()}-`;
  const candidates = entries
    .filter((entry) => (
      entry && entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')
      && entry.name.toLowerCase().startsWith(prefix.toLowerCase())
    ))
    .sort((left, right) => left.name.localeCompare(right.name, 'de'));
  const match = candidates[0] || null;
  return match
    ? { fileName: match.name, filePath: path.win32.join(directory, match.name) }
    : null;
}

module.exports = {
  buildDocumentPdfDirectory,
  buildOrderPdfDirectory,
  findTimestampedAbFile,
  getConfiguredBaseFilePath,
  resolveLatestOrderPdf,
  resolveLatestPurchaseOrderPdf,
};

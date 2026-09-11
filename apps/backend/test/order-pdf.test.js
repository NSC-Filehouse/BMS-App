const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildDocumentPdfDirectory,
  buildOrderPdfDirectory,
  findTimestampedAbFile,
  resolveLatestPurchaseOrderPdf,
  resolveLatestOrderPdf,
} = require('../src/order-pdf');

function fileEntry(name) {
  return { name, isFile: () => true };
}

test('selects only the newest timestamped AB PDF', () => {
  const result = findTimestampedAbFile([
    fileEntry('3-03-26-00772_EB_20260910_095920.pdf'),
    fileEntry('3-03-26-00772_LI_20260910_095921.pdf'),
    fileEntry('3-03-26-00772_AB_20260526_154145.pdf'),
    fileEntry('3-03-26-00772_AB_20260910_095918.pdf'),
    fileEntry('3-03-26-00772_AB_invalid.pdf'),
  ], '3-03-26-00772');

  assert.deepEqual(result, {
    fileName: '3-03-26-00772_AB_20260910_095918.pdf',
    timestamp: '20260910095918',
  });
});

test('builds the tenant document path from the exact company name', () => {
  assert.equal(
    buildOrderPdfDirectory({
      baseFilePath: '\\\\BMS02.DOMKIMAZ.de.local\\BMS',
      companyName: 'Frupack',
      orderNumber: '3-03-26-00772',
    }),
    '\\\\BMS02.DOMKIMAZ.de.local\\BMS\\Datenbanken\\Frupack\\BMS_Dokumente\\03 Auftrag\\3-03-26-00772',
  );
});

test('builds the supplier purchase-order document path and matches the legacy filename prefix', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bms-purchase-pdf-'));
  try {
    const directory = buildDocumentPdfDirectory({
      baseFilePath: root,
      companyName: 'Frupack',
      orderNumber: '3-02-17-00001',
      documentFolder: '02 Bestellung',
    });
    assert.equal(
      directory,
      path.win32.join(root, 'Datenbanken', 'Frupack', 'BMS_Dokumente', '02 Bestellung', '3-02-17-00001'),
    );
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(
      path.join(directory, '3-02-17-00001-01 Eingang Siegmeier 06.02.2017 (2017-302).pdf'),
      'purchase',
    );
    await fs.promises.writeFile(path.join(directory, '3-02-17-00001-not-a-pdf.txt'), 'ignore');

    const result = await resolveLatestPurchaseOrderPdf({
      baseFilePath: root,
      companyName: 'Frupack',
      orderNumber: '3-02-17-00001',
    });
    assert.equal(result.fileName, '3-02-17-00001-01 Eingang Siegmeier 06.02.2017 (2017-302).pdf');
    assert.equal(await fs.promises.readFile(result.filePath, 'utf8'), 'purchase');
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('accepts a drive-letter root used by the local fallback configuration', () => {
  assert.equal(
    buildOrderPdfDirectory({
      baseFilePath: 'N:',
      companyName: 'Frupack',
      orderNumber: '3-03-26-00772',
    }),
    'N:\\Datenbanken\\Frupack\\BMS_Dokumente\\03 Auftrag\\3-03-26-00772',
  );
});

test('rejects path separators in the order number', () => {
  assert.throws(
    () => buildOrderPdfDirectory({
      baseFilePath: 'N:\\',
      companyName: 'Frupack',
      orderNumber: '..\\other-order',
    }),
    /Invalid order number/,
  );
});

test('resolves the newest AB PDF from a local test tree', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bms-order-pdf-'));
  try {
    const directory = buildOrderPdfDirectory({
      baseFilePath: root,
      companyName: 'Frupack',
      orderNumber: '3-03-26-00772',
    });
    await fs.promises.mkdir(directory, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(path.join(directory, '3-03-26-00772_AB_20260526_154145.pdf'), 'old'),
      fs.promises.writeFile(path.join(directory, '3-03-26-00772_AB_20260910_095918.pdf'), 'new'),
      fs.promises.writeFile(path.join(directory, '3-03-26-00772_EB_20260910_095920.pdf'), 'eb'),
    ]);

    const result = await resolveLatestOrderPdf({
      baseFilePath: root,
      companyName: 'Frupack',
      orderNumber: '3-03-26-00772',
    });
    assert.equal(result.fileName, '3-03-26-00772_AB_20260910_095918.pdf');
    assert.equal(await fs.promises.readFile(result.filePath, 'utf8'), 'new');
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

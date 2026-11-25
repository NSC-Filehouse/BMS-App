const { runSQLQueryAccess, runSQLQuerySqlServer } = require('./access');
const config = require('../config');
const { loadPackagingTypes } = require('./packaging-types');

const text = (value) => String(value ?? '').trim();
const normalized = (value) => text(value).toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');

function packagingKey(value) {
  const key = normalized(value);
  if (['siloware', 'silo/bulk', 'silo', 'bulk'].includes(key)) return 'silo';
  if (['sackware', 'bags'].includes(key)) return 'bags';
  if (['octa', 'octabins'].includes(key)) return 'octabins';
  return key;
}

async function loadPurchaseOptions(database, lang = 'de') {
  const language = lang === 'en' ? 'en' : 'de';
  const [packaging, incoterms] = await Promise.all([
    loadPurchasePackagingOptions(language),
    runSQLQueryAccess(database, `
      SELECT [lib_ID] AS id, [lib_Lieferbedingung] AS text
      FROM [dbo].[tblLieferbedingungen]
      WHERE LOWER(COALESCE([lib_SprachID], '')) = ? AND COALESCE([lib_Lieferbedingung], '') <> ''
      ORDER BY [lib_Lieferbedingung]`, [language]),
  ]);
  return {
    packagingTypes: packaging,
    incoterms: incoterms.map((row) => ({ id: Number(row.id), text: text(row.text) })),
  };
}

async function loadPurchasePackagingOptions(lang='de') {
  const rows = await loadPackagingTypes(lang);
  return rows.map(row => ({ ...row, key: packagingKey(row.aliases[0]) }));
}

function purchaseTruckLoadKg(packaging) {
  return packagingKey(packaging)==='silo'?25000:24750;
}

async function loadPurchasePaymentText(id, lang = 'de') {
  const rows = await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [zaS_Zahl_Text] AS text FROM [dbo].[tblZahltext_Sprachen]
    WHERE [zaS_ID] = ? AND LOWER(COALESCE([zaS_SprachID], '')) = ?`, [id, lang === 'en' ? 'en' : 'de']);
  return text(rows[0]?.text);
}

async function loadSupplierTerms(database, supplierId, lang = 'de') {
  const [orders, contacts] = await Promise.all([
    runSQLQueryAccess(database, `
      SELECT TOP 1 [b].[be_ZahlText] AS paymentConditionId, [b].[be_Lieferbedingung] AS deliveryTermText
      FROM [dbo].[tblBestellung] [b]
      WHERE LTRIM(RTRIM(COALESCE([b].[be_KdNr], ''))) = ?
        AND EXISTS (SELECT 1 FROM [dbo].[tblBest_Position] [p] WHERE [p].[beP_Bestellindex] = [b].[be_Bestellindex] AND COALESCE([p].[beP_Storno], 0) <> 1)
      ORDER BY [b].[be_Bestelldatum] DESC, [b].[be_Bestellindex] DESC`, [supplierId]),
    runSQLQueryAccess(database, `
      SELECT [kdA_lfdNR] AS id, [kdA_Anrede] AS salutation, [kdA_Vorname] AS firstName, [kdA_Name] AS lastName,
        [kdA_Position] AS position, [kdA_Ranking] AS ranking, [kdA_eMail] AS email
      FROM [dbo].[tblKun_Ansprech] WHERE [kdA_KdNR] = ?
      ORDER BY ISNULL([kdA_Ranking], 9), [kdA_Name], [kdA_Vorname], [kdA_lfdNR]`, [supplierId]),
  ]);
  const row = orders[0] || {};
  const paymentConditionId = Number(row.paymentConditionId) || null;
  const paymentConditionText = paymentConditionId ? await loadPurchasePaymentText(paymentConditionId, lang) : '';
  const names = contacts.map((contact) => ({ ...contact, name: [contact.salutation, contact.firstName, contact.lastName].map(text).filter(Boolean).join(' ') })).filter((contact) => contact.name);
  const contact = names.find((item) => Number(item.ranking) === 1) || (names.length === 1 ? names[0] : null);
  return { paymentConditionId, paymentConditionText, deliveryTermText: text(row.deliveryTermText),
    supplierContact: contact?.name || '', supplierContactId: contact?.id ?? null, contacts: names };
}

async function loadPurchaseWarehouses(database, supplierId, warehouseId = '') {
  const supplier = text(supplierId);
  if (!supplier) return [];
  const rows = await runSQLQueryAccess(database, `
    SELECT w.kdLa_LagerID AS id, w.kdLa_Strecke AS isDirect,
      COALESCE(NULLIF(LTRIM(RTRIM(w.kdLa_Kurz)),N''),
        NULLIF(LTRIM(RTRIM(CONCAT(w.kdLa_Name1,N' ',w.kdLa_Ort))),N'')) AS label,
      w.kdLa_KdNR AS customerId, w.kdLa_KdNR2 AS alternateCustomerId,
      k.kd_Name1 AS customerName, k2.kd_Name1 AS alternateCustomerName
    FROM dbo.tblKun_Lager w
    LEFT JOIN dbo.tblKunden k ON k.kd_KdNR=w.kdLa_KdNR
    LEFT JOIN dbo.tblKunden k2 ON k2.kd_KdNR=w.kdLa_KdNR2
    WHERE (w.kdLa_Strecke=1 OR w.kdLa_KdNR=? OR w.kdLa_KdNR2=? OR EXISTS (
      SELECT 1 FROM dbo.tblBestellung b
      JOIN dbo.tblBest_Position p ON p.beP_Bestellindex=b.be_Bestellindex
      JOIN dbo.tblBest_Pos_Lager stock ON stock.bePL_BEposID=p.beP_BEposID
      WHERE b.be_KdNr=? AND stock.bePL_LagerID=w.kdLa_LagerID AND COALESCE(p.beP_Storno,0)<>1
    )) ${warehouseId ? 'AND w.kdLa_LagerID=?' : ''}
    ORDER BY w.kdLa_Strecke DESC, w.kdLa_Kurz, w.kdLa_LagerID`,
  [supplier, supplier, supplier, ...(warehouseId ? [warehouseId] : [])]);
  return rows.map(row => {
    const customerId = text(row.customerId);
    const alternateCustomerId = text(row.alternateCustomerId);
    const owners = [
      { id: customerId, name: text(row.customerName) },
      { id: alternateCustomerId, name: text(row.alternateCustomerName) },
    ].filter(owner => owner.id && owner.name);
    return { id: text(row.id), label: text(row.label), isDirect: Boolean(row.isDirect),
      defaultOwnerId: customerId === alternateCustomerId && owners.length ? customerId : '',
      owners: [...new Map(owners.map(owner => [owner.id, owner])).values()] };
  });
}

async function loadLatestPurchase(database, supplierId, articleIndex) {
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1 [p].[beP_Artikelindex] AS articleIndex,
      COALESCE(NULLIF(LTRIM(RTRIM([a].[agA_Artikelname_Lieferant])), N''), [p].[beP_Artikel]) AS article,
      [a].[agA_Artikelname] AS masterArticleName,
      [a].[agA_Artikelname_Lieferant] AS supplierArticleName, [p].[beP_Artikel] AS lastPurchaseArticle,
      [b].[be_Verpackung] AS originalPackagingType,
      COALESCE([p].[beP_EK_EU], CASE WHEN ISNULL(NULLIF(RTRIM([b].[be_BasisValuta]), N''), N'EUR') = N'EUR'
        THEN [p].[beP_EK_DM] END) AS lastPurchasePrice,
      [p].[beP_Lieferdatum] AS lastDeliveryDate, [b].[be_Bestelldatum] AS lastOrderDate,
      COALESCE(NULLIF(LTRIM(RTRIM([b].[be_AdresseAbhol])), N''),
        NULLIF(LTRIM(RTRIM([b].[be_AdresseSP_Abhol])), N'')) AS loadingLocationText
    FROM [dbo].[tblBest_Position] [p] JOIN [dbo].[tblBestellung] [b] ON [b].[be_Bestellindex] = [p].[beP_Bestellindex]
    LEFT JOIN [dbo].[tblArt_Artikel] [a] ON [a].[agA_Artikelindex] = [p].[beP_Artikelindex]
    WHERE LTRIM(RTRIM(COALESCE([b].[be_KdNr], ''))) = ? AND LTRIM(RTRIM(COALESCE([p].[beP_Artikelindex], ''))) = ?
      AND COALESCE([p].[beP_Storno], 0) <> 1
    ORDER BY [b].[be_Bestelldatum] DESC, [b].[be_Bestellindex] DESC, [p].[beP_BEposID] DESC`, [supplierId, articleIndex]);
  return rows[0] || null;
}

async function enrichPurchaseArticleNames(database, supplierId, positions) {
  const ids = [...new Set(positions.map(position => text(position.articleIndex)).filter(Boolean))];
  const sources = new Map(await Promise.all(ids.map(async id => [id, await loadLatestPurchase(database, supplierId, id)])));
  return positions.map(position => {
    const source = sources.get(text(position.articleIndex));
    const masterArticleName = text(source?.masterArticleName);
    const storedName = text(position.article);
    // Preserve an already stored supplier spelling; recognize legacy drafts saved with our master name.
    const article = !position.optionId && (!storedName || masterArticleName && normalized(storedName) === normalized(masterArticleName))
      ? text(source?.article) || storedName : storedName;
    return { ...position, article, masterArticleName };
  });
}

function commonLoadingLocations(rows, articleIndexes) {
  const required = [...new Set(articleIndexes.map(normalized).filter(Boolean))];
  if (!required.length) return [];
  const places = new Map();
  for (const row of rows) {
    const location = text(row.loadingLocationText);
    const key = normalized(location);
    const articleId = normalized(row.articleIndex);
    if (!key || !required.includes(articleId)) continue;
    if (!places.has(key)) places.set(key, { text: location, articles: new Set() });
    places.get(key).articles.add(articleId);
  }
  return [...places.values()].filter((place) => required.every((id) => place.articles.has(id))).map((place) => ({
    // Historical addresses are text, never a technical address primary key.
    id: place.text, text: place.text, source: 'supplier_order_history', countryCode: '', region: '',
  }));
}

async function loadPurchaseLocations(database, supplierId, articleIndexes, { supplierWide = false } = {}) {
  const ids = [...new Set(articleIndexes.map(text).filter(Boolean))];
  if (!supplierId || (!supplierWide && !ids.length)) return [];
  const rows = await runSQLQueryAccess(database, `
    SELECT [p].[beP_Artikelindex] AS articleIndex, [pickup].[address] AS loadingLocationText
    FROM [dbo].[tblBestellung] [b] JOIN [dbo].[tblBest_Position] [p] ON [p].[beP_Bestellindex] = [b].[be_Bestellindex]
    CROSS APPLY (VALUES ([b].[be_AdresseAbhol]), ([b].[be_AdresseSP_Abhol])) [pickup]([address])
    WHERE LTRIM(RTRIM(COALESCE([b].[be_KdNr], ''))) = ? ${supplierWide ? '' : `AND LTRIM(RTRIM([p].[beP_Artikelindex])) IN (${ids.map(() => '?').join(',')})`}
      AND COALESCE([p].[beP_Storno], 0) <> 1 AND NULLIF(LTRIM(RTRIM([pickup].[address])), N'') IS NOT NULL
    ORDER BY [b].[be_Bestelldatum] DESC, [b].[be_Bestellindex] DESC`, [supplierId, ...(supplierWide ? [] : ids)]);
  return supplierWide ? commonLoadingLocations(rows.map(row => ({ ...row, articleIndex: '*' })), ['*']) : commonLoadingLocations(rows, ids);
}

function findPackaging(options, value, id) {
  return options.find((option) => id && Number(option.id) === Number(id))
    || options.find((option) => option.aliases.some((alias) => packagingKey(alias) === packagingKey(value)));
}

module.exports = { enrichPurchaseArticleNames, loadPurchaseOptions,loadPurchasePackagingOptions,purchaseTruckLoadKg, loadSupplierTerms, loadPurchaseWarehouses, loadPurchasePaymentText, loadLatestPurchase, loadPurchaseLocations, commonLoadingLocations, findPackaging, packagingKey };

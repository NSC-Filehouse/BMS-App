const config = require('../config');
const { runSQLQueryAccess, runSQLQuerySqlServer } = require('./access');

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
    runSQLQuerySqlServer(config.sql.database, `
      SELECT [spT_ID] AS id, [spT_de] AS de, [spT_en] AS en
      FROM [dbo].[tblSprachenTexte]
      WHERE [spT_GruppenID] = 1 AND LTRIM(RTRIM(COALESCE([spT_Ort], N''))) = N'BE, AB'
        AND NULLIF(LTRIM(RTRIM([spT_de])), N'') IS NOT NULL
      ORDER BY [spT_SortKey], [spT_ID]`, []),
    runSQLQueryAccess(database, `
      SELECT [lib_ID] AS id, [lib_Lieferbedingung] AS text
      FROM [dbo].[tblLieferbedingungen]
      WHERE LOWER(COALESCE([lib_SprachID], '')) = ? AND COALESCE([lib_Lieferbedingung], '') <> ''
      ORDER BY [lib_Lieferbedingung]`, [language]),
  ]);
  return {
    packagingTypes: packaging.map((row) => ({ id: Number(row.id), text: text(language === 'en' ? row.en || row.de : row.de), key: packagingKey(row.de), aliases: [text(row.de), text(row.en)].filter(Boolean) })),
    incoterms: incoterms.map((row) => ({ id: Number(row.id), text: text(row.text) })),
  };
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
      SELECT [kdA_lfdNR] AS id, [kdA_Anrede] AS salutation, [kdA_Vorname] AS firstName, [kdA_Name] AS lastName, [kdA_Ranking] AS ranking
      FROM [dbo].[tblKun_Ansprech] WHERE [kdA_KdNR] = ?
      ORDER BY ISNULL([kdA_Ranking], 9), [kdA_Name], [kdA_Vorname], [kdA_lfdNR]`, [supplierId]),
  ]);
  const row = orders[0] || {};
  const paymentConditionId = Number(row.paymentConditionId) || null;
  const payment = paymentConditionId ? await runSQLQuerySqlServer(config.sql.database, `
    SELECT TOP 1 [zaS_Zahl_Text] AS text FROM [dbo].[tblZahltext_Sprachen]
    WHERE [zaS_ID] = ? AND LOWER(COALESCE([zaS_SprachID], '')) = ?`, [paymentConditionId, lang === 'en' ? 'en' : 'de']) : [];
  const names = contacts.map((contact) => ({ ...contact, name: [contact.salutation, contact.firstName, contact.lastName].map(text).filter(Boolean).join(' ') })).filter((contact) => contact.name);
  const contact = names.find((item) => Number(item.ranking) === 1) || (names.length === 1 ? names[0] : null);
  return { paymentConditionId, paymentConditionText: text(payment[0]?.text), deliveryTermText: text(row.deliveryTermText), supplierContact: contact?.name || '', contacts: names };
}

async function loadLatestPurchase(database, supplierId, articleIndex) {
  const rows = await runSQLQueryAccess(database, `
    SELECT TOP 1 [p].[beP_Artikelindex] AS articleIndex,
      COALESCE(NULLIF(LTRIM(RTRIM([a].[agA_Artikelname])), N''), [p].[beP_Artikel]) AS article,
      [a].[agA_Artikelname_Lieferant] AS supplierArticleName, [p].[beP_Artikel] AS lastPurchaseArticle,
      [b].[be_Verpackung] AS originalPackagingType,
      COALESCE([p].[beP_EK_EU], [p].[beP_EK_DM]) AS lastPurchasePrice,
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

async function loadPurchaseLocations(database, supplierId, articleIndexes) {
  const ids = [...new Set(articleIndexes.map(text).filter(Boolean))];
  if (!supplierId || !ids.length) return [];
  const rows = await runSQLQueryAccess(database, `
    SELECT [p].[beP_Artikelindex] AS articleIndex, [pickup].[address] AS loadingLocationText
    FROM [dbo].[tblBestellung] [b] JOIN [dbo].[tblBest_Position] [p] ON [p].[beP_Bestellindex] = [b].[be_Bestellindex]
    CROSS APPLY (VALUES ([b].[be_AdresseAbhol]), ([b].[be_AdresseSP_Abhol])) [pickup]([address])
    WHERE LTRIM(RTRIM(COALESCE([b].[be_KdNr], ''))) = ? AND LTRIM(RTRIM([p].[beP_Artikelindex])) IN (${ids.map(() => '?').join(',')})
      AND COALESCE([p].[beP_Storno], 0) <> 1 AND NULLIF(LTRIM(RTRIM([pickup].[address])), N'') IS NOT NULL
    ORDER BY [b].[be_Bestelldatum] DESC, [b].[be_Bestellindex] DESC`, [supplierId, ...ids]);
  return commonLoadingLocations(rows, ids);
}

function findPackaging(options, value, id) {
  return options.find((option) => id && Number(option.id) === Number(id))
    || options.find((option) => option.aliases.some((alias) => packagingKey(alias) === packagingKey(value)));
}

module.exports = { loadPurchaseOptions, loadSupplierTerms, loadLatestPurchase, loadPurchaseLocations, commonLoadingLocations, findPackaging, packagingKey };

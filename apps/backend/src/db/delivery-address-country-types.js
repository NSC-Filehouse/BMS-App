const { runSQLQuerySqlServer } = require('./access');

const COUNTRY_DATABASE = 'BMS';

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapCountryType(row) {
  return {
    id: asText(row?.id ?? row?.la_LandISO).toUpperCase(),
    isoAlpha2: asText(row?.isoAlpha2 ?? row?.la_ISOalpha2).toUpperCase(),
    name: asText(row?.name ?? row?.la_Land),
    nameEnglish: asText(row?.nameEnglish ?? row?.la_Land_eng),
  };
}

async function loadDeliveryAddressCountryTypes() {
  const rows = await runSQLQuerySqlServer(COUNTRY_DATABASE, `
    SELECT
      [la_LandISO] AS [id],
      [la_ISOalpha2] AS [isoAlpha2],
      [la_Land] AS [name],
      [la_Land_eng] AS [nameEnglish]
    FROM [dbo].[tblLand]
    WHERE NULLIF(LTRIM(RTRIM([la_ISOalpha2])), '') IS NOT NULL
    ORDER BY [la_ISOalpha2] ASC, [la_LandISO] ASC
  `);

  return (Array.isArray(rows) ? rows : [])
    .map(mapCountryType)
    .filter((country) => country.id && country.isoAlpha2);
}

async function getDeliveryAddressCountryType(countryId) {
  const id = asText(countryId).toUpperCase();
  if (!id) return null;

  const rows = await runSQLQuerySqlServer(COUNTRY_DATABASE, `
    SELECT TOP (1)
      [la_LandISO] AS [id],
      [la_ISOalpha2] AS [isoAlpha2],
      [la_Land] AS [name],
      [la_Land_eng] AS [nameEnglish]
    FROM [dbo].[tblLand]
    WHERE [la_LandISO] = ?
      AND NULLIF(LTRIM(RTRIM([la_ISOalpha2])), '') IS NOT NULL
  `, [id]);

  const country = Array.isArray(rows) && rows.length ? mapCountryType(rows[0]) : null;
  return country?.id && country?.isoAlpha2 ? country : null;
}

module.exports = {
  getDeliveryAddressCountryType,
  loadDeliveryAddressCountryTypes,
};

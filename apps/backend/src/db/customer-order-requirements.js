const { runSQLQueryAccess, runSQLQuerySqlServer } = require('./access');
const { isAppCreatedPrivateCustomer } = require('./customer-creation-history');
const countryCache = new Map();
const hasText = (value) => Boolean(String(value || '').trim());

async function resolveCustomerOrderRequirements(database, customer) {
  let vatIdRequired = true;
  let privatePerson = false;
  if (!hasText(customer.kd_UST_Ident_Nr)) {
    const code = String(customer.kd_LK || '').trim().toUpperCase();
    let country = countryCache.get(code);
    if (code && (!country || country.until < Date.now())) {
      const rows = await runSQLQuerySqlServer('BMS', `SELECT TOP (1) [la_ISOalpha2] AS [iso], [la_EU_Land] AS [euLand]
        FROM [dbo].[tblLand] WHERE [la_LandISO]=? OR [la_ISOalpha2]=?`, [code, code]);
      country = { value: rows[0] || null, until: Date.now() + 300000 };
      countryCache.set(code, country);
    }
    const knownCountry = /^[A-Z]{2}$/.test(String(country?.value?.iso || ''));
    if (knownCountry && country.value.euLand === false) vatIdRequired = false;
    else if (knownCountry && country.value.euLand === true) {
      privatePerson = await isAppCreatedPrivateCustomer(database, customer.kd_KdNR, customer.kd_Name1, country.value.iso);
      vatIdRequired = !privatePerson;
    }
  }
  const missingFields = [];
  if (!hasText(customer.kd_RG_Email)) missingFields.push('invoiceEmail');
  if (vatIdRequired && !hasText(customer.kd_UST_Ident_Nr)) missingFields.push('vatId');
  return { available: true, customerFound: true, missingFields, vatIdRequired, privatePerson };
}
async function loadCustomerOrderRequirements(database, customerId) {
  const id = String(customerId || '').trim();
  if (!id) return { available: true, customerFound: false, missingFields: [] };
  const rows = await runSQLQueryAccess(database, `SELECT TOP (1) [kd_KdNR],[kd_Name1],[kd_LK],[kd_RG_Email],[kd_UST_Ident_Nr]
    FROM [dbo].[tblKunden] WHERE [kd_KdNR]=?`, [id]);
  return rows[0] ? resolveCustomerOrderRequirements(database, rows[0]) : { available: true, customerFound: false, missingFields: [] };
}
module.exports = { loadCustomerOrderRequirements, resolveCustomerOrderRequirements };

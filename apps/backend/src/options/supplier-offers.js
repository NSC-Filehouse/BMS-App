const config = require('../config');
const { runSQLQuerySqlServer } = require('../db/access');
const { loadOffers } = require('./read');
const { supplierKey, companyKey, knownSupplier } = require('./supplier-identity');

async function loadSupplierOffers(database, customer) {
  const names = [customer.kd_Name1, customer.kd_Name2, customer.kd_Kurz].filter(Boolean);
  const known = names.map(knownSupplier).find(Boolean)
    || knownSupplier(customer.kd_HomePage) || knownSupplier(customer.kd_eMail);
  const keys = new Set();
  if (known) keys.add(known.key);
  else {
    names.forEach(name => keys.add(supplierKey(name)));
    // Existing reviewed account links also work for less familiar suppliers.
    const accounts = await runSQLQuerySqlServer(config.sql.database, `SELECT olk_LieferantenNummer AS number,
      olk_MandantID AS mandantId,olk_Lieferantenkennung AS supplierKey,olk_Lieferantenname AS supplierName
      FROM BMSApp.tblOptionenLieferantenKonto WHERE olk_Aktiv=1`);
    for (const account of accounts) {
      if (Number(account.mandantId) === Number(database.firmaId) && account.number === customer.kd_KdNR
        || names.some(name => companyKey(name) === companyKey(account.supplierName))) {
        keys.add(knownSupplier(account.supplierKey)?.key || account.supplierKey);
        keys.add(supplierKey(account.supplierName));
      }
    }
  }
  keys.delete('unknown');
  const offers = keys.size ? (await loadOffers(null)).filter(offer => keys.has(offer.supplierKey)) : [];
  return { offers, supplierIdentified: keys.size > 0 };
}
module.exports = { loadSupplierOffers };

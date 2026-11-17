const {runSQLQueryAccess}=require('../db/access');
const {supplierCandidates}=require('./purchase-source');
const {resolveSupplierContact}=require('./supplier-contacts');
const logger=require('../logger');

// Enrich only the displayed source person, within the active tenant's proven
// supplier accounts. Offer phone numbers take precedence over ERP contacts.
async function enrichOptionContactPhone(database,offer) {
  if(!offer.contact?.name || offer.contact.phone || !database)return offer;
  try {
    const suppliers=(await supplierCandidates(database,offer)).filter(row=>row.plausible);
    if(!suppliers.length)return offer;
    const contacts=await runSQLQueryAccess(database,`SELECT kdA_lfdNR AS id,kdA_KdNR AS supplierId,
      kdA_Vorname AS firstName,kdA_Name AS lastName,kdA_eMail AS email,
      kdA_Telefon AS phone,kdA_PrivatTel AS privatePhone,kdA_Handy AS mobile
      FROM dbo.tblKun_Ansprech WHERE kdA_KdNR IN(SELECT [value] FROM OPENJSON(?))`,
    [JSON.stringify(suppliers.map(row=>row.id))]);
    const source={candidates:[offer.contact]},phones=new Map();
    for(const supplier of suppliers) {
      const scoped=contacts.filter(row=>String(row.supplierId).trim().toLowerCase()===String(supplier.id).trim().toLowerCase());
      const resolved=resolveSupplierContact(source,scoped);
      if(resolved.status==='ambiguous')return offer;
      const contact=scoped.find(row=>row.id===resolved.selectedId);
      const phone=contact && [contact.phone,contact.privatePhone,contact.mobile].map(value=>String(value || '').trim()).find(Boolean);
      const dial=phone?.replace(/[^+\d*#]/g,'');
      if(dial && /\d/.test(dial))phones.set(dial,phone);
    }
    if(phones.size===1)return {...offer,contact:{...offer.contact,phone:[...phones.values()][0]}};
  } catch(error) {
    // A missing optional ERP phone must not make the original offer unavailable.
    logger.warn(`Option ${offer.id}: BMS-Kontakttelefon konnte nicht ergänzt werden: ${error.message}`);
  }
  return offer;
}

module.exports={enrichOptionContactPhone};

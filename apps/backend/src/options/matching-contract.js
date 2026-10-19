const crypto = require('node:crypto');
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function articleHash(article) {
  return hash(Object.fromEntries(['articleIndex','articleName','supplierArticleName','productNumber','tradeName','description','color',
    'mfi','mfiTo','mfiMethod','density','groupName','polymerCategory','polymerSubCategory'].map(key => [key,article[key] ?? null])));
}
function queueSql(companyParameter='@company', reasonParameter='@reason') {
  return `UPDATE BMSApp.tblOptionenAbgleichAuftrag WITH(UPDLOCK,HOLDLOCK)
    SET oaa_Revision=oaa_Revision+1,oaa_Status=CASE WHEN oaa_Status=N'running' THEN N'running' ELSE N'pending' END,
      oaa_NaechsterVersuchAm=SYSUTCDATETIME(),oaa_Grund=${reasonParameter},oaa_GeaendertAm=SYSUTCDATETIME()
    WHERE oaa_MandantID=${companyParameter};
    IF @@ROWCOUNT=0 INSERT BMSApp.tblOptionenAbgleichAuftrag(oaa_MandantID,oaa_Grund) VALUES(${companyParameter},${reasonParameter});`;
}
module.exports = { hash, articleHash, queueSql };

const { runSQLQueryAccess } = require('./access');
const { buildDeliveryAddressText } = require('../delivery-address');

const DELIVERY_ADDRESS_COLUMNS = `
  [kdL_KdNR],
  [kdL_ID],
  [kdL_Lieferanschrift_Nr],
  [kdL_Kurz],
  [kdL_Name1],
  [kdL_Name2],
  [kdL_Strasse],
  [kdL_LK],
  [kdL_PLZ],
  [kdL_Ort],
  [kdL_Region],
  [kdL_Kontrakt],
  [kdL_Abhol]
`;

function mapDeliveryAddressRow(row) {
  return {
    id: row?.kdL_ID === null || row?.kdL_ID === undefined
      ? ''
      : String(row.kdL_ID).trim(),
    addressNo: row?.kdL_Lieferanschrift_Nr === null || row?.kdL_Lieferanschrift_Nr === undefined
      ? ''
      : String(row.kdL_Lieferanschrift_Nr).trim(),
    customerId: row?.kdL_KdNR === null || row?.kdL_KdNR === undefined
      ? ''
      : String(row.kdL_KdNR).trim(),
    text: buildDeliveryAddressText(row),
    short: row?.kdL_Kurz === null || row?.kdL_Kurz === undefined ? '' : String(row.kdL_Kurz).trim(),
    name1: row?.kdL_Name1 === null || row?.kdL_Name1 === undefined ? '' : String(row.kdL_Name1).trim(),
    name2: row?.kdL_Name2 === null || row?.kdL_Name2 === undefined ? '' : String(row.kdL_Name2).trim(),
  };
}

async function loadCustomerDeliveryAddresses(database, customerId) {
  const rows = await runSQLQueryAccess(database, `
    SELECT
      ${DELIVERY_ADDRESS_COLUMNS}
    FROM [dbo].[tblKun_LiefAdress]
    WHERE COALESCE([kdL_KdNR], '') = ?
    ORDER BY [kdL_Lieferanschrift_Nr] ASC
  `, [String(customerId ?? '').trim()]);
  return (Array.isArray(rows) ? rows : []).map(mapDeliveryAddressRow);
}

module.exports = {
  loadCustomerDeliveryAddresses,
  mapDeliveryAddressRow,
};

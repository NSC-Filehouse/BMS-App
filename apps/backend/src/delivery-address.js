function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildDeliveryAddressText(row) {
  const name1 = asText(row?.kdL_Name1);
  const name2 = asText(row?.kdL_Name2);
  const street = asText(row?.kdL_Strasse);
  const plz = asText(row?.kdL_PLZ);
  const city = asText(row?.kdL_Ort);
  const country = asText(row?.kdL_LK);
  const plzCity = [plz, city].filter(Boolean).join(' ');
  return [name1, name2, street, plzCity, country].filter(Boolean).join(', ');
}

module.exports = { buildDeliveryAddressText };

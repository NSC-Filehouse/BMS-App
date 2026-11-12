const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function offeredQuantityKg(position) {
  const stock = number(position.stockKg ?? position.opp_ChargenbestandKg);
  if (stock != null && stock >= 0) return stock;
  const kind = position.quantityKind ?? position.opp_Mengenart;
  const maximum = number(position.quantityMaxKg ?? position.opp_MengeBisKg);
  const minimum = number(position.quantityMinKg ?? position.opp_MengeVonKg);
  if (kind !== 'minimum-and-stock' && (maximum > 0 || minimum > 0)) return maximum > 0 ? maximum : minimum;
  const confirmed = number(position.confirmedQuantityKg);
  return confirmed > 0 ? confirmed : null;
}

// Only original quantity fields are hashed. Background matching/normalization
// must not silently discard a manual confirmation of an unchanged source.
function quantitySourceHashSql(alias = 'p') {
  return `CONVERT(VARCHAR(64),HASHBYTES('SHA2_256',CONCAT(N'quantity-v1|',
    COALESCE(CONVERT(NVARCHAR(50),${alias}.opp_MengeVon),N''),N'|',
    COALESCE(CONVERT(NVARCHAR(50),${alias}.opp_MengeBis),N''),N'|',
    COALESCE(${alias}.opp_Mengeneinheit,N''),N'|',COALESCE(${alias}.opp_MengeRohtext,N''),N'|',
    COALESCE(CONVERT(NVARCHAR(50),${alias}.opp_ChargenbestandRoh),N''),N'|',
    COALESCE(CONVERT(NVARCHAR(50),${alias}.opp_MindestabnahmeRoh),N''))),2)`;
}

function confirmedQuantitySql(alias = 'p') {
  return `CASE WHEN ${alias}.opp_MengeBestaetigtQuellHash=${quantitySourceHashSql(alias)} THEN ${alias}.opp_GesamtmengeBestaetigtKg END`;
}

function quantityAvailability(position, orderedKg = 0) {
  const offeredKg = offeredQuantityKg(position);
  return { offeredKg, orderedKg: Number(orderedKg) || 0,
    remainingKg: offeredKg == null ? null : Math.max(0, Math.round((offeredKg - orderedKg) * 1000) / 1000) };
}

function fitsQuantity(offeredKg, orderedKg, requestedKg) {
  return offeredKg != null && Math.round(orderedKg * 1000) + Math.round(requestedKg * 1000) <= Math.round(offeredKg * 1000);
}

function quantityInputKg(body,kgPerTruck=null) {
  if(body?.totalUnit!=null || body?.totalAmount!=null) {
    if(!['kg','t','truck'].includes(body.totalUnit) || body.totalUnit==='truck' && !(kgPerTruck>0))return null;
    const amount=number(body.totalAmount);
    return amount==null?null:amount*(body.totalUnit==='t'?1000:body.totalUnit==='truck'?kgPerTruck:1);
  }
  // Previously deployed dialogs send their explicitly entered kg total here.
  return number(body?.totalKg);
}

function isTruckOffer(position) {
  const kind=position.quantityKind??position.opp_Mengenart;
  return kind!=='minimum-and-stock' && /\b(?:trucks?|truckloads?|loads?|lkw|ladungen?)\b/i.test(
    `${kind || ''} ${position.quantityUnit || ''}`);
}

function offeredTruckCount(position) {
  if(!isTruckOffer(position))return null;
  const maximum=number(position.truckMax ?? position.quantityMax);
  const minimum=number(position.truckMin ?? position.quantityMin);
  return maximum>0?maximum:minimum>0?minimum:null;
}

module.exports = { offeredQuantityKg, quantityAvailability, fitsQuantity,quantitySourceHashSql,confirmedQuantitySql,quantityInputKg,isTruckOffer,offeredTruckCount };

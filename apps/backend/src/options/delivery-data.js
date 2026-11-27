function optionDeliveryDataSql(positionAlias = 'p') {
  const column = `${positionAlias}.opp_LieferdatenJson`;
  const json = `CASE WHEN ISJSON(${column})=1 THEN ${column} END`;
  const value = key => `NULLIF(LTRIM(RTRIM(JSON_VALUE(${json}, '$.${key}'))), N'')`;
  const code = value('incotermCode');
  return {
    incoterm: `COALESCE(${code}, ${value('incotermText')}, o.op_Incoterm)`,
    loadingLocation: `COALESCE(${value('pickupLocation')}, ${value('stockLocation')},
      CASE WHEN UPPER(${code}) IN (N'FCA',N'EXW') THEN COALESCE(${value('locationText')}, ${value('namedPlace')}) END,
      NULLIF(o.op_Ladeort, N''))`,
  };
}

module.exports = { optionDeliveryDataSql };

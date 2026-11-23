const collation = 'Latin1_General_CI_AS';
const sqlTypes = {
  bigint: [8, 19, 0],
  int: [4, 10, 0],
  datetime2: [8, 27, 7],
  decimal: [9, 19, 4],
  char: [3, 0, 0],
  nvarchar: [-1, 0, 0],
  varbinary: [-1, 0, 0],
};

function addTable(schema, name, columns, indexes, checks, foreignKey) {
  if (schema.tables.some(table => table.name === name)) return;
  schema.tables.push({ name });
  columns.forEach(([columnName, typeName, options = {}], index) => {
    const [bytes, precision, scale] = sqlTypes[typeName];
    schema.columns.push({
      tableName: name, column_id: index + 1, name: columnName, typeName, precision, scale,
      max_length: options.length ? options.length * 2 : bytes,
      collation_name: ['char', 'nvarchar'].includes(typeName) ? collation : null,
      is_nullable: Boolean(options.nullable), is_identity: Boolean(options.identity), is_computed: false,
      ...(options.identity ? { seedValue: 1, incrementValue: 1 } : {}),
      ...(options.default ? { defaultName: `DF_${name}_${columnName}`, defaultDefinition: options.default } : {}),
    });
  });

  indexes.forEach(([indexName, keys, { primary = false, unique = false } = {}], index) => {
    const indexId = index + 1;
    schema.indexes.push({
      tableName: name, index_id: indexId, name: indexName, type_desc: primary ? 'CLUSTERED' : 'NONCLUSTERED',
      is_primary_key: primary, is_unique_constraint: unique, is_unique: primary || unique,
      allow_row_locks: true, allow_page_locks: true,
    });
    keys.forEach((columnName, keyIndex) => schema.indexColumns.push({
      tableName: name, index_id: indexId, key_ordinal: keyIndex + 1, columnName,
    }));
  });

  for (const [suffix, condition] of Object.entries(checks)) {
    schema.checks.push({ tableName: name, name: `CK_${name}_${suffix}`, definition: `(${condition})` });
  }

  const [field, referencedTable, referencedColumn] = foreignKey;
  const fkName = `FK_${name}_${field}`;
  schema.foreignKeys.push({
    tableName: name, name: fkName, referencedSchema: 'BMSApp', referencedTable,
    deleteAction: 'NO_ACTION', updateAction: 'NO_ACTION',
  });
  schema.foreignKeyColumns.push({ name: fkName, constraint_column_id: 1, columnName: field, referencedColumn });
}

function addOfferPdfSchema(schema) {
  const outbox = 'OptionOfferMailOutbox';
  const legacyUnique = schema.indexes.find(index => index.tableName === outbox && index.name === 'UQ_OptionOfferMailOutbox_Customer');
  schema.indexes = schema.indexes.filter(index => index !== legacyUnique);
  if (legacyUnique) schema.indexColumns = schema.indexColumns.filter(column =>
    column.tableName !== outbox || column.index_id !== legacyUnique.index_id);
  schema.checks = schema.checks.filter(check => check.name !== 'CK_OptionOfferMailOutbox_Source');
  schema.columns.find(column => column.tableName === outbox && column.name === 'OptionPositionId').is_nullable = true;

  for (const [tableName, name, typeName, maxLength] of [
    ['tbl_Temp_Angebot', 'tag_offer_pdf', 'varbinary', -1],
    [outbox, 'StockPositionKey', 'nvarchar', 128],
    [outbox, 'TempOfferId', 'int', 4],
  ]) {
    if (schema.columns.some(column => column.tableName === tableName && column.name === name)) continue;
    const [, precision, scale] = sqlTypes[typeName];
    schema.columns.push({
      tableName, name, typeName, max_length: maxLength, precision, scale,
      is_nullable: true, is_identity: false, is_computed: false, collation_name: typeName === 'nvarchar' ? collation : null,
    });
  }
  for (const [name, keys, filterColumn] of [
    ['UX_OptionOfferMailOutbox_OptionCustomer', ['CompanyId', 'OptionPositionId', 'CustomerNumber'], 'OptionPositionId'],
    ['UX_OptionOfferMailOutbox_StockCustomer', ['CompanyId', 'StockPositionKey', 'CustomerNumber'], 'StockPositionKey'],
    ['UX_OptionOfferMailOutbox_TempOffer', ['TempOfferId'], 'TempOfferId'],
  ]) {
    const indexes = schema.indexes.filter(index => index.tableName === outbox);
    if (indexes.some(index => index.name === name)) continue;
    const indexId = Math.max(0, ...indexes.map(index => index.index_id)) + 1;
    schema.indexes.push({
      tableName: outbox, name, index_id: indexId, is_unique: true, type_desc: 'NONCLUSTERED',
      filter_definition: `([${filterColumn}] IS NOT NULL)`, allow_row_locks: true, allow_page_locks: true,
    });
    keys.forEach((columnName, index) => schema.indexColumns.push({
      tableName: outbox, index_id: indexId, columnName, key_ordinal: index + 1,
    }));
  }
  const checkName = 'CK_OptionOfferMailOutbox_OfferSource';
  if (!schema.checks.some(check => check.name === checkName)) schema.checks.push({
    tableName: outbox, name: checkName,
    definition: '(([OptionPositionId] IS NOT NULL AND [StockPositionKey] IS NULL) OR ([OptionPositionId] IS NULL AND [StockPositionKey] IS NOT NULL) OR ([OptionPositionId] IS NULL AND [StockPositionKey] IS NULL AND [TempOfferId] IS NOT NULL))',
  });
  const fkName = 'FK_OptionOfferMailOutbox_TempOffer';
  if (!schema.foreignKeys.some(fk => fk.name === fkName)) {
    schema.foreignKeys.push({
      tableName: outbox, name: fkName, referencedSchema: 'BMSApp', referencedTable: 'tbl_Temp_Angebot',
      deleteAction: 'NO_ACTION', updateAction: 'NO_ACTION',
    });
    schema.foreignKeyColumns.push({ name: fkName, constraint_column_id: 1, columnName: 'TempOfferId', referencedColumn: 'tag_id' });
  }
}

module.exports = function addOptionOfferSchema(schema) {
  const optional = { nullable: true };
  const timestamp = { default: '(sysutcdatetime())' };
  addTable(schema, 'OptionOfferMailOutbox', [
    ['Id', 'bigint', { identity: true }],
    ['CompanyId', 'int'], ['OptionPositionId', 'int'],
    ['CustomerNumber', 'nvarchar', { length: 10 }], ['ArticleIndex', 'nvarchar', { length: 50 }],
    ['ContactId', 'int'], ['ContactName', 'nvarchar', { length: 200 }], ['RecipientEmail', 'nvarchar', { length: 320 }],
    ['SenderCode', 'nvarchar', { length: 3 }], ['SenderName', 'nvarchar', { length: 200 }], ['SenderEmail', 'nvarchar', { length: 320 }],
    ['SalePricePerTonne', 'decimal'], ['Currency', 'char'], ['IncotermId', 'int'], ['IncotermText', 'nvarchar', { length: 250 }],
    ['Status', 'nvarchar', { length: 20, default: "(N'pending')" }],
    ['MailServiceId', 'nvarchar', { length: 100, nullable: true }], ['SentAt', 'datetime2', optional],
    ['AttemptCount', 'int', { default: '((0))' }], ['NextAttemptAt', 'datetime2', optional], ['LockedAt', 'datetime2', optional],
    ['LastError', 'nvarchar', { length: 2000, nullable: true }],
    ['CreatedAt', 'datetime2', timestamp], ['UpdatedAt', 'datetime2', timestamp],
  ], [
    ['PK_OptionOfferMailOutbox', ['Id'], { primary: true }],
    ['UQ_OptionOfferMailOutbox_Customer', ['CompanyId', 'OptionPositionId', 'CustomerNumber'], { unique: true }],
    ['IX_OptionOfferMailOutbox_Status', ['Status', 'NextAttemptAt', 'Id']],
  ], {
    Status: "[Status] IN (N'pending', N'sending', N'submitted', N'sent', N'failed', N'unknown')",
    SentAt: "[Status] <> N'sent' OR [SentAt] IS NOT NULL",
    SalePrice: '[SalePricePerTonne] >= 0',
  }, ['OptionPositionId', 'tblOptionenPositionen', 'opp_id']);

  addTable(schema, 'tbl_Temp_Aktivitaet', [
    ['Id', 'bigint', { identity: true }], ['OptionOfferMailId', 'bigint'],
    ['CompanyId', 'int'], ['CustomerNumber', 'nvarchar', { length: 10 }],
    ['ActivityDate', 'datetime2'], ['EmployeeCode', 'nvarchar', { length: 3 }], ['Description', 'nvarchar'],
    ['Status', 'nvarchar', { length: 20, default: "(N'pending')" }],
    ['BmsActivityId', 'int', optional], ['ImportedAt', 'datetime2', optional],
    ['LastError', 'nvarchar', { length: 2000, nullable: true }],
    ['CreatedAt', 'datetime2', timestamp], ['UpdatedAt', 'datetime2', timestamp],
  ], [
    ['PK_tbl_Temp_Aktivitaet', ['Id'], { primary: true }],
    ['UQ_tbl_Temp_Aktivitaet_OptionOfferMail', ['OptionOfferMailId'], { unique: true }],
    ['IX_tbl_Temp_Aktivitaet_Status', ['Status', 'Id']],
  ], {
    Status: "[Status] IN (N'pending', N'importing', N'imported', N'failed')",
    Imported: "[Status] <> N'imported' OR ([BmsActivityId] IS NOT NULL AND [ImportedAt] IS NOT NULL)",
  }, ['OptionOfferMailId', 'OptionOfferMailOutbox', 'Id']);

  addTable(schema, 'OptionOfferDocument', [
    ['OptionOfferMailId', 'bigint'],
    ['OfferJson', 'nvarchar'],
    ['BmsDocumentJson', 'nvarchar', optional],
  ], [
    ['PK_OptionOfferDocument', ['OptionOfferMailId'], { primary: true }],
  ], {
    Offer: 'ISJSON([OfferJson]) = 1',
    Document: '[BmsDocumentJson] IS NULL OR ISJSON([BmsDocumentJson]) = 1',
  }, ['OptionOfferMailId', 'OptionOfferMailOutbox', 'Id']);
  addOfferPdfSchema(schema);
};

module.exports.offerMailUpgrade = `
 -- Use one ERP offer and PDF for every new customer-mail job.
 IF COL_LENGTH(N'BMSApp.tbl_Temp_Angebot',N'tag_offer_pdf') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[tbl_Temp_Angebot] ADD [tag_offer_pdf] VARBINARY(MAX) NULL;');
 IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox',N'StockPositionKey') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ADD [StockPositionKey] NVARCHAR(64) COLLATE Latin1_General_CI_AS NULL;');
 IF COL_LENGTH(N'BMSApp.OptionOfferMailOutbox',N'TempOfferId') IS NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ADD [TempOfferId] INT NULL;');
 IF OBJECT_ID(N'BMSApp.CK_OptionOfferMailOutbox_Source',N'C') IS NOT NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [CK_OptionOfferMailOutbox_Source];');
 IF OBJECT_ID(N'BMSApp.UQ_OptionOfferMailOutbox_Customer',N'UQ') IS NOT NULL
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [UQ_OptionOfferMailOutbox_Customer];');
 IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'BMSApp.OptionOfferMailOutbox') AND name=N'OptionPositionId' AND is_nullable=0)
 BEGIN
  IF OBJECT_ID(N'BMSApp.FK_OptionOfferMailOutbox_OptionPositionId',N'F') IS NOT NULL
   EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] DROP CONSTRAINT [FK_OptionOfferMailOutbox_OptionPositionId];');
  EXEC(N'ALTER TABLE [BMSApp].[OptionOfferMailOutbox] ALTER COLUMN [OptionPositionId] INT NULL;');
 END;
`;

const collation = 'Latin1_General_CI_AS';
const sqlTypes = {
  bigint: [8, 19, 0],
  int: [4, 10, 0],
  datetime2: [8, 27, 7],
  decimal: [9, 19, 4],
  char: [3, 0, 0],
  nvarchar: [-1, 0, 0],
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
};

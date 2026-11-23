const fs=require('node:fs');
const path=require('node:path');
const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const input=argument('--input');
if(!input){console.error('Usage: node generate-schema-installer.cjs --input schema.json [--output install_BMSApp.sql]');process.exit(1);}
const output=argument('--output') || path.resolve(__dirname,'../sql/install_BMSApp.sql');
const schema=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const addOptionOfferSchema=require('./option-offer-schema.cjs');
addOptionOfferSchema(schema);
const missingContact=!schema.tables.some(t=>t.name==='ContactCreationOperation');
const quote=value=>'['+String(value).replaceAll(']',']]')+']';
const literal=value=>"N'"+String(value).replaceAll("'","''")+"'";
const full=name=>`[BMSApp].${quote(name)}`;
const execute=sql=>`EXEC(${literal(sql)});`;
const on=flag=>flag?'ON':'OFF';
const positionReferences=[
 ['tbl_Temp_Ang_Position','tagp_order_position_id','tbl_Temp_Auf_Position','tap_id'],
 ['tbl_Temp_Auf_Position','tap_purchase_position_id','tbl_Temp_Best_Position','tbp_id'],
 ['tbl_Temp_Auf_Position','tap_offer_position_id','tbl_Temp_Ang_Position','tagp_id'],
 ['tbl_Temp_Auf_Position','tap_option_position_id','tblOptionenPositionen','opp_id'],
 ['tbl_Temp_Best_Position','tbp_order_position_id','tbl_Temp_Auf_Position','tap_id'],
];
for(const [tableName,name,referencedTable,referencedColumn] of positionReferences){
 if(!schema.columns.some(column=>column.tableName===tableName && column.name===name)){
  schema.columns.push({
   tableName,name,typeName:'int',max_length:4,precision:10,scale:0,
   is_nullable:true,is_identity:false,is_computed:false,collation_name:null,
  });
 }
 const indexName=`IX_${tableName}_${name}`;
 const tableIndexes=schema.indexes.filter(index=>index.tableName===tableName);
 if(!tableIndexes.some(index=>index.name===indexName)){
  const indexId=Math.max(0,...tableIndexes.map(index=>index.index_id))+1;
  schema.indexes.push({tableName,name:indexName,index_id:indexId,type_desc:'NONCLUSTERED',allow_row_locks:true,allow_page_locks:true});
  schema.indexColumns.push({tableName,index_id:indexId,columnName:name,key_ordinal:1});
 }
 const fkName=`FK_${tableName}_${name}`;
 if(!schema.foreignKeys.some(fk=>fk.tableName===tableName && fk.name===fkName)){
  schema.foreignKeys.push({tableName,name:fkName,referencedTable,referencedSchema:'BMSApp',deleteAction:'NO_ACTION',updateAction:'NO_ACTION'});
  schema.foreignKeyColumns.push({name:fkName,constraint_column_id:1,columnName:name,referencedColumn});
 }
}
if(schema.triggers.length || schema.userTypes.length || schema.tables.some(t=>t.temporal_type||t.is_memory_optimized))throw Error('Additional schema features require explicit handling.');
if(schema.indexes.some(index=>index.dataSpace && index.dataSpace!=='PRIMARY'))throw Error('Custom filegroups/partition schemes require explicit handling.');
function type(column){
 const name=quote(column.typeName);
 if(['nvarchar','nchar','varchar','char','binary','varbinary'].includes(column.typeName))return `${name}(${column.max_length===-1?'MAX':column.max_length/(['nvarchar','nchar'].includes(column.typeName)?2:1)})`;
 if(['decimal','numeric'].includes(column.typeName))return `${name}(${column.precision},${column.scale})`;
 if(['datetime2','datetimeoffset','time'].includes(column.typeName))return `${name}(${column.scale})`;
 return name;
}
function columns(index){return schema.indexColumns.filter(c=>c.tableName===index.tableName && c.index_id===index.index_id);}
function keyColumns(index){return columns(index).filter(c=>!c.is_included_column).sort((a,b)=>a.key_ordinal-b.key_ordinal).map(c=>`${quote(c.columnName)} ${c.is_descending_key?'DESC':'ASC'}`).join(', ');}
let sql=`/* BMS-App: complete schema installation, baseline 2026-11-17.
   Execute this ONE file in the selected central BMS database (SSMS or sqlcmd -d).
   Source: current BMSApp schema inspected with Windows integrated authentication.
   Includes OptionReader tables, contact-creation and option-offer tables.
   Does not create ERP databases, accounts, test offers, supplier mappings or business data.
   Existing tables/data are retained. Incompatible columns abort the whole transaction.
   This is an installation baseline, not an upgrade of arbitrary historical versions.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
    THROW 51000,N'Select the central BMS application database before installing.',1;
IF (SELECT compatibility_level FROM sys.databases WHERE database_id=DB_ID())<130
    THROW 51000,N'BMS-App requires SQL Server 2016+ and database compatibility level 130+.',1;

BEGIN TRY
 BEGIN TRANSACTION;
 IF SCHEMA_ID(N'BMSApp') IS NULL EXEC(N'CREATE SCHEMA [BMSApp] AUTHORIZATION [dbo]');

 -- Tables and their primary/unique keys. Foreign keys follow after all tables.
`;
for(const table of schema.tables){
 const entries=schema.columns.filter(c=>c.tableName===table.name).map(c=>{
  if(c.is_computed)return `    ${quote(c.name)} AS ${c.computedDefinition}${c.is_persisted?' PERSISTED':''}`;
  if(c.is_sparse || c.is_filestream)throw Error('Unexpected special column.');
  return `    ${quote(c.name)} ${type(c)}${c.collation_name?' COLLATE '+c.collation_name:''}${c.is_identity?` IDENTITY(${c.seedValue},${c.incrementValue})${c.identityNotForReplication?' NOT FOR REPLICATION':''}`:''}${c.is_rowguidcol?' ROWGUIDCOL':''} ${c.is_nullable?'NULL':'NOT NULL'}${c.defaultDefinition?` CONSTRAINT ${quote(c.defaultName)} DEFAULT ${c.defaultDefinition}`:''}`;
 });
 for(const index of schema.indexes.filter(i=>i.tableName===table.name && (i.is_primary_key||i.is_unique_constraint))){
  entries.push(`    CONSTRAINT ${quote(index.name)} ${index.is_primary_key?'PRIMARY KEY':'UNIQUE'} ${index.type_desc} (${keyColumns(index)})`);
 }
 sql+=`\n IF OBJECT_ID(${literal('BMSApp.'+table.name)},N'U') IS NULL\n BEGIN\n  ${execute(`CREATE TABLE ${full(table.name)} (\n${entries.join(',\n')}\n);`)}\n END;\n`;
}
const contactColumns=[
 ['OperationId','uniqueidentifier',16,0],['UserId','nvarchar',200,0],['Mandant','nvarchar',20,0],['CustomerNumber','nvarchar',20,0],['RequestHash','char',64,0],
 ['InputJson','nvarchar',-1,0],['RequestJson','nvarchar',-1,0],['ResponseJson','nvarchar',-1,1],['Status','nvarchar',40,0],['HttpStatus','int',4,1],['ContactId','int',4,1],['ErpOperationId','nvarchar',200,1],['AttemptCount','int',4,0],['LockedAt','datetime2',8,1],['CreatedAt','datetime2',8,0],['UpdatedAt','datetime2',8,0]
];
const contactTypes={uniqueidentifier:[0,0],nvarchar:[0,0],char:[0,0],int:[10,0],datetime2:[27,7]};
const collation=schema.columns.find(c=>c.collation_name).collation_name;
const contactDefaults={AttemptCount:'((0))',CreatedAt:'(sysutcdatetime())',UpdatedAt:'(sysutcdatetime())'};
const contactSchema=contactColumns.map(([name,typeName,max_length,is_nullable],i)=>({tableName:'ContactCreationOperation',column_id:i+1,name,typeName,max_length,precision:contactTypes[typeName][0],scale:contactTypes[typeName][1],is_nullable:Boolean(is_nullable),is_identity:false,is_computed:false,collation_name:['char','nvarchar'].includes(typeName)?collation:null,defaultName:contactDefaults[name]?'DF_ContactCreationOperation_'+name:null,defaultDefinition:contactDefaults[name] || null}));
const contactDDL=`CREATE TABLE [BMSApp].[ContactCreationOperation] (\n${contactSchema.map(c=>`    ${quote(c.name)} ${type(c)}${c.collation_name?' COLLATE '+c.collation_name:''} ${c.is_nullable?'NULL':'NOT NULL'}${c.defaultDefinition?` CONSTRAINT ${quote(c.defaultName)} DEFAULT ${c.defaultDefinition}`:''}`).join(',\n')},\n    CONSTRAINT [PK_ContactCreationOperation] PRIMARY KEY CLUSTERED ([OperationId])\n);`;
if(missingContact)sql+=`\n IF OBJECT_ID(N'BMSApp.ContactCreationOperation',N'U') IS NULL\n BEGIN\n  ${execute(contactDDL)}\n END;\n`;
sql+='\n -- Add optional position links to existing installations before checking their columns.\n';
for(const [tableName,name] of positionReferences){
 sql+=` IF COL_LENGTH(${literal('BMSApp.'+tableName)},${literal(name)}) IS NULL\n  ${execute(`ALTER TABLE ${full(tableName)} ADD ${quote(name)} [int] NULL;`)}\n`;
}
sql+=addOptionOfferSchema.offerMailUpgrade;
// Keep the compatibility manifest inside the one executable SQL file. It
// contains schema metadata only; no environment names, accounts or row data.
const expected=[...schema.columns,...(missingContact?contactSchema:[])].map(c=>({table:c.tableName,column:c.name,type:c.typeName,length:c.max_length,precision:c.precision,scale:c.scale,nullable:c.is_nullable,identity:c.is_identity,computed:c.is_computed,collation:c.collation_name}));
sql+=`\n -- Fail before adding constraints/indexes to incompatible existing tables.\n DECLARE @expectedColumns NVARCHAR(MAX)=${literal('[\n'+expected.map(row=>JSON.stringify(row)).join(',\n')+'\n]')};\n IF EXISTS (\n  SELECT e.tableName,e.columnName,e.typeName,e.maxLength,e.precisionValue,e.scaleValue,e.nullableValue,e.identityValue,e.computedValue,e.collationName\n  FROM OPENJSON(@expectedColumns) WITH(tableName SYSNAME '$.table',columnName SYSNAME '$.column',typeName SYSNAME '$.type',maxLength SMALLINT '$.length',precisionValue TINYINT '$.precision',scaleValue TINYINT '$.scale',nullableValue BIT '$.nullable',identityValue BIT '$.identity',computedValue BIT '$.computed',collationName NVARCHAR(128) '$.collation')e\n  EXCEPT\n  SELECT t.name,c.name,ty.name,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,c.collation_name\n  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'BMSApp'\n ) THROW 51001,N'Existing BMSApp columns differ from the installation baseline. Restore or upgrade that installation explicitly; no data was changed.',1;\n\n -- Secondary indexes.\n`;
const indexes=[...schema.indexes.filter(i=>!i.is_primary_key&&!i.is_unique_constraint),...(missingContact?[{tableName:'ContactCreationOperation',name:'IX_ContactCreationOperation_Scope',type_desc:'NONCLUSTERED',is_unique:false,contact:true}]:[])];
for(const index of indexes){
 if(!['CLUSTERED','NONCLUSTERED'].includes(index.type_desc)||index.is_disabled)throw Error('Unexpected index type/state.');
 const included=index.contact?[]:columns(index).filter(c=>c.is_included_column).map(c=>quote(c.columnName));
 const keys=index.contact?'[UserId] ASC, [Mandant] ASC, [CustomerNumber] ASC, [CreatedAt] DESC':keyColumns(index);
 const options=index.contact?'':` WITH (PAD_INDEX=${on(index.is_padded)}, STATISTICS_NORECOMPUTE=${on(index.no_recompute)}, IGNORE_DUP_KEY=${on(index.ignore_dup_key)}, ALLOW_ROW_LOCKS=${on(index.allow_row_locks)}, ALLOW_PAGE_LOCKS=${on(index.allow_page_locks)}${index.fill_factor?', FILLFACTOR='+index.fill_factor:''})`;
 const ddl=`CREATE ${index.is_unique?'UNIQUE ':''}${index.type_desc} INDEX ${quote(index.name)} ON ${full(index.tableName)} (${keys})${included.length?' INCLUDE ('+included.join(', ')+')':''}${index.filter_definition?' WHERE '+index.filter_definition:''}${options};`;
 sql+=` IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(${literal('BMSApp.'+index.tableName)}) AND name=${literal(index.name)})\n  ${execute(ddl)}\n`;
}
sql+='\n -- Check constraints.\n';
const checks=[...schema.checks,...(missingContact?[['InputJson','ISJSON([InputJson])=1'],['RequestJson','ISJSON([RequestJson])=1'],['ResponseJson','ISJSON([ResponseJson])=1'],['Status',"[Status] IN (N'sending',N'unknown',N'failed',N'created')"]].map(([name,definition])=>({tableName:'ContactCreationOperation',name:'CK_ContactCreationOperation_'+name,definition:'('+definition+')'})):[])];
for(const check of checks){
 if(check.is_disabled||check.is_not_trusted)throw Error('Disabled/untrusted check requires review.');
 sql+=` IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(${literal('BMSApp.'+check.tableName)}) AND name=${literal(check.name)})\n  ${execute(`ALTER TABLE ${full(check.tableName)} WITH CHECK ADD CONSTRAINT ${quote(check.name)} CHECK${check.is_not_for_replication?' NOT FOR REPLICATION':''} ${check.definition};`)}\n`;
}
sql+='\n -- Foreign keys, including the reciprocal position links.\n';
for(const fk of schema.foreignKeys){
 if(fk.is_disabled||fk.is_not_trusted||fk.referencedSchema!=='BMSApp')throw Error('Foreign key requires additional review.');
 const pairs=schema.foreignKeyColumns.filter(c=>c.name===fk.name).sort((a,b)=>a.constraint_column_id-b.constraint_column_id);
 const ddl=`ALTER TABLE ${full(fk.tableName)} WITH CHECK ADD CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${pairs.map(p=>quote(p.columnName)).join(', ')}) REFERENCES ${quote(fk.referencedSchema)}.${quote(fk.referencedTable)} (${pairs.map(p=>quote(p.referencedColumn)).join(', ')})${fk.deleteAction!=='NO_ACTION'?' ON DELETE '+fk.deleteAction.replaceAll('_',' '):''}${fk.updateAction!=='NO_ACTION'?' ON UPDATE '+fk.updateAction.replaceAll('_',' '):''}${fk.is_not_for_replication?' NOT FOR REPLICATION':''};`;
 sql+=` IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(${literal('BMSApp.'+fk.tableName)}) AND name=${literal(fk.name)})\n  ${execute(ddl)}\n`;
}
sql+=`\n COMMIT TRANSACTION;\n SELECT DB_NAME() AS databaseName,N'BMSApp' AS schemaName,${schema.tables.length+(missingContact?1:0)} AS expectedTables,N'installed' AS result;\nEND TRY\nBEGIN CATCH\n IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;\n THROW;\nEND CATCH;\n`;
fs.writeFileSync(output,sql);
console.log(`Generated installer: ${schema.tables.length+(missingContact?1:0)} tables, ${expected.length} columns, ${sql.length} characters.`);

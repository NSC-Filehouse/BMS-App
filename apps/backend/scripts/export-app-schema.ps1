param(
 [Parameter(Mandatory=$true)][string]$Server,
 [Parameter(Mandatory=$true)][string]$Database,
 [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
$schemaOutputPath=[System.IO.Path]::GetFullPath($Output)
[void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($schemaOutputPath))
$schemaBuilder=[System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$schemaBuilder['Data Source']=$Server;$schemaBuilder['Initial Catalog']=$Database
$schemaBuilder['Integrated Security']=$true;$schemaBuilder['Encrypt']=$true;$schemaBuilder['TrustServerCertificate']=$true
$schemaConnection=[System.Data.SqlClient.SqlConnection]::new($schemaBuilder.ConnectionString)
try{
 $schemaConnection.Open();$schemaCommand=$schemaConnection.CreateCommand();$schemaCommand.CommandTimeout=90
 $schemaCommand.CommandText=@'
SELECT t.object_id,t.name,t.is_memory_optimized,t.temporal_type FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY t.name;
SELECT t.name tableName,c.column_id,c.name,ty.name typeName,SCHEMA_NAME(ty.schema_id) typeSchema,ty.is_user_defined,c.max_length,c.precision,c.scale,c.is_nullable,c.collation_name,c.is_identity,CONVERT(NVARCHAR(50),ic.seed_value) seedValue,CONVERT(NVARCHAR(50),ic.increment_value) incrementValue,ic.is_not_for_replication identityNotForReplication,c.is_computed,cc.definition computedDefinition,cc.is_persisted,c.is_rowguidcol,c.is_sparse,c.is_filestream,dc.name defaultName,dc.definition defaultDefinition
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.identity_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY t.name,c.column_id;
SELECT t.name tableName,i.index_id,i.name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,kc.type constraintType,i.filter_definition,i.fill_factor,i.is_padded,i.ignore_dup_key,i.allow_row_locks,i.allow_page_locks,i.is_disabled,st.no_recompute,ds.name dataSpace
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.indexes i ON i.object_id=t.object_id LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=i.object_id AND kc.unique_index_id=i.index_id LEFT JOIN sys.stats st ON st.object_id=i.object_id AND st.stats_id=i.index_id LEFT JOIN sys.data_spaces ds ON ds.data_space_id=i.data_space_id
WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' AND i.index_id>0 ORDER BY t.name,i.index_id;
SELECT t.name tableName,ic.index_id,ic.index_column_id,ic.key_ordinal,c.name columnName,ic.is_descending_key,ic.is_included_column
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.index_columns ic ON ic.object_id=t.object_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY t.name,ic.index_id,ic.index_column_id;
SELECT t.name tableName,ch.name,ch.definition,ch.is_not_trusted,ch.is_disabled,ch.is_not_for_replication FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.check_constraints ch ON ch.parent_object_id=t.object_id
WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY t.name,ch.name;
SELECT t.name tableName,fk.object_id,fk.name,rs.name referencedSchema,rt.name referencedTable,fk.delete_referential_action_desc deleteAction,fk.update_referential_action_desc updateAction,fk.is_not_trusted,fk.is_disabled,fk.is_not_for_replication
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.foreign_keys fk ON fk.parent_object_id=t.object_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
WHERE s.name=N'BMSApp' AND t.name NOT LIKE N'OptionenReplay[_]%' AND t.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY t.name,fk.name;
SELECT fk.name,fkc.constraint_column_id,pc.name columnName,rc.name referencedColumn FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=pt.schema_id JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE s.name=N'BMSApp' AND pt.name NOT LIKE N'OptionenReplay[_]%' AND pt.name NOT LIKE N'OptionenTestReplayBackup[_]%' ORDER BY fk.name,fkc.constraint_column_id;
SELECT tr.name,t.name tableName,sm.definition,sm.uses_ansi_nulls,sm.uses_quoted_identifier,tr.is_disabled FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.sql_modules sm ON sm.object_id=tr.object_id WHERE s.name=N'BMSApp';
SELECT ty.name typeName,SCHEMA_NAME(ty.schema_id) schemaName FROM sys.types ty WHERE ty.is_user_defined=1 AND ty.user_type_id IN(SELECT c.user_type_id FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'BMSApp');
'@
 $schemaReader=$schemaCommand.ExecuteReader();$schemaResult=[ordered]@{};$schemaSets=@('tables','columns','indexes','indexColumns','checks','foreignKeys','foreignKeyColumns','triggers','userTypes');$schemaSet=0
 do{
  $schemaRows=@();while($schemaReader.Read()){$schemaRow=[ordered]@{};for($schemaColumn=0;$schemaColumn -lt $schemaReader.FieldCount;$schemaColumn++){$schemaValue=if($schemaReader.IsDBNull($schemaColumn)){$null}else{$schemaReader.GetValue($schemaColumn)};$schemaRow[$schemaReader.GetName($schemaColumn)]=$schemaValue};$schemaRows+=[pscustomobject]$schemaRow}
  $schemaResult[$schemaSets[$schemaSet]]=@($schemaRows);$schemaSet++
 }while($schemaReader.NextResult());$schemaReader.Dispose()
 $schemaResult|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $schemaOutputPath -Encoding utf8
 Write-Output ("Read schema only as {0}: {1} tables, {2} columns, {3} indexes, {4} foreign keys, {5} triggers, {6} user types." -f [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,$schemaResult.tables.Count,$schemaResult.columns.Count,$schemaResult.indexes.Count,$schemaResult.foreignKeys.Count,$schemaResult.triggers.Count,$schemaResult.userTypes.Count)
}finally{$schemaConnection.Dispose()}

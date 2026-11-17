param([Parameter(Mandatory=$true)][string]$Server)
$ErrorActionPreference='Stop'
# The caller can choose only the server, never an existing target database.
$installTestDatabase='BMSApp_InstallTest_'+[guid]::NewGuid().ToString('N')
if($installTestDatabase -notmatch '^BMSApp_InstallTest_[0-9a-f]{32}$'){throw 'Invalid scratch database name.'}
$installTestBuilder=[System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$installTestBuilder['Data Source']=$Server;$installTestBuilder['Initial Catalog']='master'
$installTestBuilder['Integrated Security']=$true;$installTestBuilder['Encrypt']=$true;$installTestBuilder['TrustServerCertificate']=$true
$installTestAdmin=[System.Data.SqlClient.SqlConnection]::new($installTestBuilder.ConnectionString)
$installTestConnection=$null;$installTestCreated=$false
try {
  $installTestAdmin.Open();$installTestCommand=$installTestAdmin.CreateCommand();$installTestCommand.CommandTimeout=120
  $installTestCommand.CommandText="CREATE DATABASE [$installTestDatabase]";[void]$installTestCommand.ExecuteNonQuery();$installTestCreated=$true
  $installTestBuilder['Initial Catalog']=$installTestDatabase
  $installTestConnection=[System.Data.SqlClient.SqlConnection]::new($installTestBuilder.ConnectionString);$installTestConnection.Open()
  $installTestCommand=$installTestConnection.CreateCommand();$installTestCommand.CommandTimeout=180
  $installTestSql=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../sql/install_BMSApp.sql') -Raw
  & (Join-Path $PSScriptRoot 'install-schema.ps1') -Server $Server -Database $installTestDatabase
  $installTestCommand.CommandText=@'
IF (SELECT COUNT(*) FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'BMSApp')<>42 THROW 51010,N'Incomplete table installation.',1;
IF (SELECT COUNT(*) FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'BMSApp')<>21 THROW 51010,N'Incomplete foreign keys.',1;
IF EXISTS(SELECT 1 FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'BMSApp' AND (f.is_disabled=1 OR f.is_not_trusted=1)) THROW 51010,N'Untrusted foreign key.',1;
INSERT BMSApp.PushMandantSetting(pms_UserEmail,pms_CompanyId,pms_Mandant) VALUES(N'schema-test@example.invalid',0,N'TEST');
'@
  [void]$installTestCommand.ExecuteNonQuery()
  $installTestCommand.CommandText=$installTestSql;[void]$installTestCommand.ExecuteNonQuery()
  $installTestCommand.CommandText="IF (SELECT COUNT(*) FROM BMSApp.PushMandantSetting WHERE pms_UserEmail=N'schema-test@example.invalid')<>1 THROW 51010,N'Repeated install changed existing rows.',1;"
  [void]$installTestCommand.ExecuteNonQuery()
  Write-Output 'PASS: empty installation, complete constraints, repeated installation and existing-row preservation.'
  $installTestCommand.CommandText='DROP TABLE BMSApp.ContactCreationOperation; ALTER TABLE BMSApp.PushSubscription ALTER COLUMN ps_Language NVARCHAR(9) NULL;'
  [void]$installTestCommand.ExecuteNonQuery()
  $installTestRejected=$false
  try {$installTestCommand.CommandText=$installTestSql;[void]$installTestCommand.ExecuteNonQuery()}
  catch [System.Data.SqlClient.SqlException] {if($_.Exception.Number -ne 51001){throw};$installTestRejected=$true}
  if(!$installTestRejected){throw 'Incompatible existing columns were not rejected.'}
  $installTestCommand.CommandText="IF OBJECT_ID(N'BMSApp.ContactCreationOperation',N'U') IS NOT NULL THROW 51010,N'Partial installation was not rolled back.',1; IF (SELECT COUNT(*) FROM BMSApp.PushMandantSetting WHERE pms_UserEmail=N'schema-test@example.invalid')<>1 THROW 51010,N'Existing data changed after rejected installation.',1; ALTER TABLE BMSApp.PushSubscription ALTER COLUMN ps_Language NVARCHAR(10) NULL;"
  [void]$installTestCommand.ExecuteNonQuery()
  $installTestCommand.CommandText=$installTestSql;[void]$installTestCommand.ExecuteNonQuery()
  Write-Output 'PASS: incompatible-schema rejection, atomic rollback and recovery.'
} finally {
  if($installTestConnection){$installTestConnection.Dispose()}
  if($installTestCreated){
    # Exact generated identifier, not a configurable production database name.
    $installTestCommand=$installTestAdmin.CreateCommand();$installTestCommand.CommandTimeout=120
    $installTestCommand.CommandText="ALTER DATABASE [$installTestDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$installTestDatabase];"
    [void]$installTestCommand.ExecuteNonQuery()
  }
  $installTestAdmin.Dispose()
}
Write-Output 'PASS: isolated scratch database removed; production schema/data untouched.'

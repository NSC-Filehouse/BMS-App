param(
  [Parameter(Mandatory=$true)][string]$Server,
  [Parameter(Mandatory=$true)][string]$Database
)
$ErrorActionPreference='Stop'
$installBuilder=[System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$installBuilder['Data Source']=$Server;$installBuilder['Initial Catalog']=$Database
$installBuilder['Integrated Security']=$true;$installBuilder['Encrypt']=$true;$installBuilder['TrustServerCertificate']=$true
$installConnection=[System.Data.SqlClient.SqlConnection]::new($installBuilder.ConnectionString)
try {
  $installConnection.Open()
  $installCommand=$installConnection.CreateCommand();$installCommand.CommandTimeout=180
  $installCommand.CommandText=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../sql/install_BMSApp.sql') -Raw
  [void]$installCommand.ExecuteNonQuery()
  Write-Output "BMSApp schema installed/verified in $Database on $Server using Windows authentication."
} finally {$installConnection.Dispose()}

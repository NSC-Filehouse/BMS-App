param([string]$Server='db04.domkimaz.de.local\FILEHOUSE_DB_01',[string]$Database='BMS')
$ErrorActionPreference='Stop'
$connection=[System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Connect Timeout=15")
try {
  $connection.Open()
  $command=$connection.CreateCommand();$command.CommandTimeout=120
  foreach($file in @('add_option_purchase_order.sql','add_option_quantity_confirmation.sql')){
    $migration=Get-Content -LiteralPath (Join-Path $PSScriptRoot "../sql/$file") -Raw
    foreach($batch in [regex]::Split($migration,'(?im)^\s*GO\s*$')){
      if($batch.Trim()){$command.CommandText=$batch;[void]$command.ExecuteNonQuery()}
    }
  }
  $command.CommandText="SELECT ORIGINAL_LOGIN() AS windowsLogin,COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'OptionID') AS optionIdBytes,COL_LENGTH(N'BMSApp.tbl_Temp_Best_Position',N'OptionPositionID') AS optionPositionIdBytes"
  $reader=$command.ExecuteReader();$table=[System.Data.DataTable]::new();$table.Load($reader)
  $table|Select-Object windowsLogin,optionIdBytes,optionPositionIdBytes|ConvertTo-Json -Compress
} finally {$connection.Dispose()}

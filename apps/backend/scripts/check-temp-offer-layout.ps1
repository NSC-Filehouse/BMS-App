param([string]$Server='db04.domkimaz.de.local',[string]$Database='BMS')
$ErrorActionPreference='Stop'
$offerConnection=[System.Data.SqlClient.SqlConnection]::new("Server=$Server;Database=$Database;Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Connection Timeout=15")
$offerTransaction=$null
try {
  $offerConnection.Open()
  $offerTransaction=$offerConnection.BeginTransaction()
  $offerCommand=$offerConnection.CreateCommand()
  $offerCommand.Transaction=$offerTransaction
  $offerCommand.CommandTimeout=60
  $offerCommand.CommandText=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../sql/compact_temp_offer_order_layout.sql') -Raw
  [void]$offerCommand.ExecuteNonQuery()
  [void]$offerCommand.ExecuteNonQuery() # idempotent while already compacted
  $offerCommand.CommandText=@'
IF COL_LENGTH('BMSApp.tbl_Temp_Angebot','tag_language') IS NOT NULL THROW 50002,'Header still contains document language.',1;
IF COL_LENGTH('BMSApp.tbl_Temp_Ang_Position','tagp_rejected') IS NOT NULL THROW 50002,'Position still contains rejected flag.',1;
INSERT BMSApp.tbl_Temp_Angebot(tag_company_id,tag_created_by,tag_modified_by,tag_client_request_id,tag_customer_id,tag_customer_name,tag_customer_address)
VALUES(0,N'NSC',N'NSC',NEWID(),N'0',N'Rollback schema check',N'');
DECLARE @offerId int=CONVERT(int,SCOPE_IDENTITY());
INSERT BMSApp.tbl_Temp_Ang_Position(tagp_offer_id,tagp_line_no,tagp_line_key,tagp_article_index,tagp_article,tagp_master_article,tagp_quantity,tagp_unit,tagp_price,tagp_price_basis,tagp_reserve)
VALUES(@offerId,1,NEWID(),N'0',N'Rollback schema check',N'Rollback schema check',1,N'KG',1,1000,0);
SELECT SUSER_SNAME();
'@
  $offerLogin=$offerCommand.ExecuteScalar()
  Write-Output "PASS: compact schema, idempotent cleanup and minimal header/position insert as $offerLogin."
} finally {
  if($offerTransaction){$offerTransaction.Rollback();$offerTransaction.Dispose()}
  $offerConnection.Dispose()
}
Write-Output 'PASS: schema and test rows rolled back. Run the actual cleanup only AFTER deploying the updated backend.'

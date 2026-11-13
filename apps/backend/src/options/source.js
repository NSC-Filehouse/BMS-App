const config = require('../config');
const { runSQLQuerySqlServer } = require('../db/access');
const { appTableSql } = require('../db/app-tables');
const { createHttpError } = require('../utils');
const { berlinDate } = require('./read');

async function loadOptionSource(id, kind) {
  const today = berlinDate();
  // Sources have the same shared visibility as the option's current positions.
  // Fetch large mail/file contents only when the user opens that source.
  const columns = kind === 'mail'
    ? 'o.op_QuelleMailtext AS body,o.op_QuelleMailformat AS format'
    : 'o.op_QuelleDatei AS content,o.op_QuelleDateiname AS fileName,o.op_QuelleDateiMime AS mime';
  const rows = await runSQLQuerySqlServer(config.sql.database, `SELECT ${columns}
    FROM ${appTableSql('options')} o
    WHERE o.op_id=? AND o.op_GeloeschtAm IS NULL AND o.op_IstDemo=0
      AND o.op_Pruefstatus IN(N'approved',N'pending') AND o.op_Geschaeftsstatus=N'open'
      AND o.op_GueltigAb<=? AND EXISTS(SELECT 1 FROM ${appTableSql('optionPositions')} p
        WHERE p.opp_op_id=o.op_id AND COALESCE(p.opp_GueltigBis,o.op_GueltigBis)>=?)`, [id,today,today]);
  const source = rows[0];
  if (!source || (kind === 'mail' ? !source.body : !source.content?.length)) {
    throw createHttpError(404, 'Originalbeleg nicht verfügbar.', { code: 'OPTION_SOURCE_NOT_FOUND' });
  }
  return source;
}

function sourceFileType(source) {
  const mime = String(source.mime || '').toLowerCase().trim();
  // Only the passive document formats accepted by OptionReader may be opened.
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (allowed.includes(mime)) return mime;
  if (!mime) {
    const extension = String(source.fileName || '').match(/\.(pdf|png|jpe?g)$/i)?.[1].toLowerCase();
    const inferred = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[extension];
    if (inferred) return inferred;
  }
  throw createHttpError(415, 'Dieses Originaldateiformat kann nicht geöffnet werden.', { code: 'OPTION_SOURCE_TYPE_UNSUPPORTED' });
}

module.exports = { loadOptionSource, sourceFileType };

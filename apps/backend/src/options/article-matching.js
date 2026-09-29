function normalizeProductName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function polymer(value) {
  const text = String(value || '').toUpperCase();
  if (/LDPE/.test(text)) return 'LDPE';
  if (/HDPE|PEHD/.test(text)) return 'HDPE';
  if (/PPHP|PPH\b|PP[ -]?HOMO/.test(text)) return 'PP_HOMO';
  if (/PPC|PP[ -]?COPO/.test(text)) return 'PP_COPO';
  return null;
}

function mfiRange(name, fallback) {
  const match = String(name || '').match(/MFI\s*([\d.,]+)\s*(?:-|–|bis)\s*([\d.,]+)/i);
  if (match) return [Number(match[1].replace(',', '.')), Number(match[2].replace(',', '.'))];
  const point = Number(fallback);
  return Number.isFinite(point) && point > 0 ? [point, point] : null;
}

function method(value) {
  const match = String(value || '').match(/(?:5|21[,.]6)\s*kg/i);
  return match ? match[0].toLowerCase().replace(',', '.').replace(/\s+/g, '') : null;
}

function rankCandidates(position, articles) {
  const targetPolymer = polymer(`${position.materialCategory || ''} ${position.articleName || ''}`);
  const targetMfi = Number(position.mfi);
  const targetMethod = method(position.mfiTestCondition);
  const targetNt = position.qualityNorm === 'NT' || /near to prime|offgrade|\bog\b/i.test(`${position.quality || ''} ${position.articleName || ''}`);
  return articles.flatMap((article) => {
    const name = String(article.articleName || '');
    const articlePolymer = polymer(name);
    if (targetPolymer && articlePolymer !== targetPolymer) return [];
    if (targetNt && !/\bNT\b/i.test(name)) return [];
    const range = mfiRange(name, article.mfi);
    if (Number.isFinite(targetMfi) && targetMfi > 0 && (!range || targetMfi < range[0] || targetMfi > range[1])) return [];
    const articleMethod = method(`${name} ${article.mfiMethod || ''}`);
    if (targetMethod && articleMethod && targetMethod !== articleMethod) return [];
    const reasons = [];
    let score = 0;
    if (targetPolymer) { score += 30; reasons.push('Kunststofftyp passt'); }
    if (targetNt) { score += 20; reasons.push('NT passt'); }
    if (range && targetMfi > 0) { score += 35; reasons.push(`MFI ${range[0]}–${range[1]}`); }
    if (targetMethod && articleMethod === targetMethod) { score += 10; reasons.push('MFI-Prüflast passt'); }
    if (position.density != null && article.density != null) {
      // Dichtevergleich nur, wenn Quelleneinheit ausdrücklich vorliegt.
      if (position.densityUnit && Number(position.density) === Number(article.density)) {
        score += 5; reasons.push('Dichte passt');
      }
    }
    return [{ articleIndex: String(article.articleIndex), articleName: name,
      groupName: article.groupName || null, mfi: article.mfi == null ? null : Number(article.mfi),
      density: article.density || null, mfiFrom: range?.[0] ?? null, mfiTo: range?.[1] ?? null,
      score, reason: reasons.join(', ') }];
  }).sort((a, b) => b.score - a.score || a.articleName.localeCompare(b.articleName, 'de')).slice(0, 30);
}

module.exports = { rankCandidates, normalizeProductName, mfiRange };

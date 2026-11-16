// Keep identical to BMS-App/apps/backend/src/options/material-facts.js.
const VERSION = '2026-11-16.1';
const {resolvedMeasurements}=require('./mfi-compatibility');
const VALUES = { quality:['NT','1A','unknown'], additives:['with','without','unknown'],
  color:['natural','black','white','transparent','mixed','other','unknown'] };
const plain = value => String(value ?? '').normalize('NFKC').replace(/<[^>]*>/g,' ')
  .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)))
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/\s+/g,' ').trim();
const normalize = value => plain(value).toLocaleLowerCase('de-DE');
function quality(value) {
  const input=plain(value);
  const nt=/\b(?:NTP|NT|OG|off[\s-]*grade|near[\s-]*(?:to[\s-]*)?prime|non[\s-]*prime)\b/i;
  const prime=/\b(?:prime|1A)\b/i;
  if(nt.test(input))return prime.test(input.replace(new RegExp(nt.source,'gi'),''))?'unknown':'NT';
  return prime.test(input)?'1A':'unknown';
}
function additives(value, article=false) {
  const input=plain(value);
  const without=/\b(?:without\s+additives|no\s+(?:adds|additives)|ohne\s+additive[n]?|additive\s*:\s*keine)\b/i.test(input)
    || article && /\bohne\s+natur\b/i.test(input);
  const withAdditives=/\b(?:with\s+additives|mit\s+additive[n]?)\b/i.test(input)
    || article && /\bmit\s+natur\b/i.test(input)
    || /\b(?:slip|anti[\s-]*block(?:ing)?)\b/i.test(input) && !/\b(?:no|without|free\s+of)\s+(?:slip|anti[\s-]*block)/i.test(input);
  return without && withAdditives?'unknown':without?'without':withAdditives?'with':'unknown';
}
function color(value) {
  const found=new Set();
  for(const [label,pattern]of [['natural',/\bnatur(?:al)?\b/i],['black',/\b(?:black|schwarz)\b/i],
    ['white',/\b(?:white|wei(?:ss|ß))\b/i],['transparent',/\btransparent\b/i],['mixed',/\b(?:bunt|mixed\s+colou?rs?)\b/i]]) {
    if(pattern.test(plain(value)))found.add(label);
  }
  return found.size===1?[...found][0]:'unknown';
}
function parsed(value) {try{return typeof value==='string'?JSON.parse(value):value || {};}catch{return {};}}
function deriveMaterialFacts(position, sourceText=null) {
  const local=[position.productName || position.articleName,position.quality,position.propertiesText].filter(Boolean).join(' ');
  const source=normalize(sourceText);
  const derived={quality:quality(local),additives:additives(local),color:color(local)};
  const supplied=position.materialFacts || parsed(position.sourceMeasurementsJson).materialFacts;
  const result={version:VERSION};
  for(const name of Object.keys(VALUES)) {
    const fact=supplied?.[name], evidence=plain(fact?.evidence);
    const detector={quality,additives,color}[name];
    if(sourceText==null && supplied?.version===VERSION && VALUES[name].includes(fact?.value)) {
      const verified=fact.verified===true && detector(evidence)===fact.value && fact.value!=='unknown';
      result[name]={...fact,value:verified?fact.value:'unknown',verified};
      continue;
    }
    const valid=VALUES[name].includes(fact?.value) && fact.value!=='unknown' && evidence
      && detector(evidence)===fact.value
      && (sourceText!=null ? source.includes(normalize(evidence)) : supplied?.version===VERSION && fact.verified===true);
    const conflict=valid && derived[name]!=='unknown' && derived[name]!==fact.value;
    const known=conflict?'unknown':valid?fact.value:derived[name];
    // An AI assertion must be source-backed. Legacy position text remains a
    // traceable fallback; unrelated mail rows are never parsed as local facts.
    const candidates=name==='quality'?[position.quality,position.productName || position.articleName,position.propertiesText]
      :[position.propertiesText,position.productName || position.articleName];
    const localEvidence=known==='unknown'?'':plain(candidates.find(value=>detector(value)===known
      && (sourceText==null || source.includes(normalize(value)))) || '').slice(0,1000);
    const localVerified=Boolean(localEvidence) && (sourceText==null || source.includes(normalize(localEvidence)));
    result[name]={value:known,evidence:conflict?evidence:valid?evidence:localEvidence || null,
      verified:!conflict && (valid || localVerified),source:conflict?'conflict':valid?'source-evidence':'position-text'};
    if(sourceText!=null && !result[name].verified)result[name].value='unknown';
  }
  return result;
}
function polymer(value) {
  const input=plain(value).replace(/_/g,' ');
  for(const [type,pattern]of [['MLLDPE',/\bm[\s-]*LLDPE\b/i],['LLDPE',/\bLLDPE\b/i],['LDPE',/\bLDPE\b|HPPE\s*-?\s*TUBULAR\s+LD\b/i],['HDPE',/\bHDPE\b|\bPE[ -]?HD\b/i],
    ['PP_RANDOM',/\bPP[\s-]*(?:random|raco|r)\b/i],['PP_HOMO',/\b(?:PPH|PPHP)\b|\bPP[\s-]*homo/i],['PP_COPO',/\bPPCP?\b|\bPP[\s-]*(?:copo|block|impact)/i],
    ['PP',/\bPP\b/i],['PE',/\bPE\b/i]])if(pattern.test(input))return type;
  return null;
}
function checkMaterial(position, article) {
  position=resolvedMeasurements(position);
  const facts=deriveMaterialFacts(position), reasons=[],missing=[];
  const articleText=[article.articleName,article.description,article.groupName].filter(Boolean).join(' ');
  const expected={quality:quality(articleText),additives:additives(articleText,true),color:color(article.color || articleText)};
  const labels={quality:'Qualität',additives:'Additive',color:'Farbe'};
  for(const name of Object.keys(labels)) {
    const actual=facts[name].value,target=expected[name];
    // Missing evidence matters when the article actually imposes that
    // requirement. An unspecified catalog field must not invent a restriction.
    if(target==='unknown' || target==='other')continue;
    if(actual==='unknown' || actual==='other')missing.push(`${labels[name]} nicht vollständig belegt`);
    else if(actual!==target)reasons.push(`${labels[name]} widerspricht der Option`);
  }
  // A declared NT offer must never suggest a regular/unspecified grade.
  if(facts.quality.value==='NT' && expected.quality==='unknown')reasons.push('Artikel ist nicht als NT ausgewiesen');
  const category=polymer(position.materialCategory),named=polymer(position.productName || position.articleName);
  const offeredType=category && !['PE','PP'].includes(category)?category:named || category;
  const targetName=polymer(article.articleName),targetCategory=polymer(`${article.polymerCategory || ''} ${article.polymerSubCategory || ''}`);
  const targetType=targetName==='MLLDPE'?targetName:targetCategory && !['PE','PP'].includes(targetCategory)?targetCategory:targetName || targetCategory;
  if(targetName && targetCategory && !['PE','PP'].includes(targetName) && !['PE','PP'].includes(targetCategory)
    && targetName!==targetCategory && !(targetName==='MLLDPE' && targetCategory==='LLDPE'))reasons.push('Artikelstamm: Kunststofftyp in Name und Kategorie widersprüchlich');
  const family=type=>['LDPE','HDPE','LLDPE','MLLDPE','PE'].includes(type)?'PE':type?.startsWith('PP')?'PP':type;
  if(offeredType && targetType && offeredType!==targetType
    && !(family(offeredType)===family(targetType) && [offeredType,targetType].some(t=>['PE','PP'].includes(t))))reasons.push('Kunststofftyp widerspricht der Option');
  if(!offeredType || !targetType || ['PE','PP'].includes(offeredType) || ['PE','PP'].includes(targetType))missing.push('Kunststoff-Untertyp nicht vollständig belegt');
  const density=articleText.match(/\b(?:Dichte|density)\s*\(?\s*(<=|>=|<|>)?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?/i);
  if(density) {
    const value=Number(position.density), unit=String(position.densityUnit || '').replace(/\s/g,'');
    if(position.density==null || !/^(?:kg\/m[3³]|g\/cm[3³])$/i.test(unit))missing.push('Dichte des Angebots nicht belegt');
    else {
      const normalizeDensity=n=>Number(String(n).replace(',','.'))/(Number(String(n).replace(',','.'))>10?1000:1);
      const from=normalizeDensity(density[2]),to=density[3]?normalizeDensity(density[3]):from;
      const measured=/^kg/i.test(unit)?value/1000:value;
      const fits=density[1]==='<'?measured<from:density[1]==='<='?measured<=from:density[1]==='>'?measured>from:density[1]==='>='?measured>=from:measured>=from && measured<=to;
      if(!fits)reasons.push('Dichte außerhalb des Artikelbereichs');
    }
  }
  return {blocked:reasons.length>0,complete:!reasons.length && !missing.length,reasons:[...new Set(reasons)],missing:[...new Set(missing)],facts};
}
module.exports={VERSION,VALUES,deriveMaterialFacts,checkMaterial,quality,additives,color,polymer};

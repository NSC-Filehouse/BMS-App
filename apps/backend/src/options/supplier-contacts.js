// Keep identical to BMS-App/apps/backend/src/options/supplier-contacts.js.
// Only supplier senders / forwarded From headers and explicit signatures count.
// Recipients, CC lists and addresses elsewhere in the thread are not contacts.
const {knownSupplier,internalIdentity}=require('./supplier-identity');
const emailOf=value=>String(value || '').match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase() || '';
const text=value=>String(value || '').replace(/<\/(?:p|div|tr)>|<br\s*\/?\s*>/gi,'\n').replace(/<!--[^]*?-->|<\/?[a-z][a-z0-9:-]*(?:\s[^>]*)?\/?>/gi,' ')
 .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)))
 .replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
 .replace(/[\u200b-\u200f\ufeff]/g,'').replace(/[ \t]+/g,' ').trim();
const personName=value=>{
 const name=text(value).replace(/^["']|["']$/g,'').trim();
 return /^[\p{L}][\p{L}'’-]+(?:\s+[\p{L}][\p{L}'’-]+){1,3}$/u.test(name)
  && !/\b(?:team|sales|manager|products|chemicals|supply|customer|service|gmbh|limited|totalenergies|regards|grüßen|geschäftsführer|department|consumer)\b/i.test(name)?name:'';
};
const automated=email=>/^(?:no[._-]?reply|do[._-]?not[._-]?reply|info|sales|office|orders?|supply|poloffgrade)(?:[._-]|@)/i.test(email);
function collectSupplierContacts(offer,message={}) {
 const body=text(message.originalBody || message.bodyText),seller=offer.supplierKey || knownSupplier(offer.supplierName)?.key;
 const reply=emailOf(offer.replyTo),replyVerified=reply && body.toLowerCase().includes(reply) && !internalIdentity(reply);
 const trusted=email=>{
  if(!email || internalIdentity(email))return false;
  const known=knownSupplier(email);
  if(known)return known.key===seller;
  return replyVerified && email.split('@')[1]===reply.split('@')[1];
 };
 const entries=[];
 const add=(email,name,source,details={})=>{
  email=emailOf(email);if(!trusted(email))return;
  name=personName(name);const previous=entries.find(e=>e.email===email);
  const entry={email,name,source,automated:automated(email),...details};
  if(previous){
   if(name && previous.name && name.toLowerCase()!==previous.name.toLowerCase()){
    if(!entries.some(e=>e.email===email && e.name===name))entries.push(entry);
   }else if(name && (!previous.name || source==='signature'))Object.assign(previous,entry);
  }else entries.push(entry);
 };
 add(message.senderEmail,message.senderName,'sender');
 for(const replyTo of message.replyTo || [])add(replyTo.email,replyTo.name,'reply-to');
 const lines=body.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 for(const line of lines){
  const from=line.match(/^(?:Von|From|De)\s*:\s*(.*?)\s*<([^>]+)>/i);
  if(from)add(from[2],from[1],'forwarded-from');
 }
 for(let i=0;i<lines.length;i++){
  if(!/^(?:kind regards(?:\s*\/\s*mit freundlichen gr[üu]ßen)?|best regards|regards|mit freundlichen gr[üu]ßen|beste gr[üu]ße)[,! .]*$/i.test(lines[i]))continue;
  let signature=lines.slice(i+1,i+13);
  const boundary=signature.findIndex(line=>/^(?:(?:Von|From|De|An|To|Cc|Betreff|Subject)\s*:|Anfang der weitergeleiteten|Begin forwarded|[-_]{3,})/i.test(line));
  if(boundary>=0)signature=signature.slice(0,boundary);
  if(internalIdentity(signature.join(' ')))continue;
  const name=signature.slice(0,3).map(personName).find(Boolean);
  if(!name)continue;
  const emails=[...new Set(signature.flatMap(s=>[...s.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)].map(m=>m[0])))].filter(trusted);
  if(emails.length!==1)continue;
  const phone=signature.join('\n');
  const number=label=>phone.match(new RegExp(`(?:^|\\n)${label}\\s*:?\\s*(\\+?[\\d(][\\d ()/.-]{5,})`,'i'))?.[1].trim() || '';
  add(emails[0],name,'signature',{telefon:number('(?:T|Tel\\.?|Telephone)'),mobil:number('(?:M|Mob\\.?|Mobile)')});
 }
 if(replyVerified)add(reply,'','offer-reply-to');
 // Some forwarded signatures retain a name, role and supplier website but no
 // email header. Use that explicit name only; never build an address from it.
 if(!entries.some(e=>e.name))for(let i=0;i<lines.length-1;i++){
  const name=personName(lines[i]);if(!name || !/^(?:CEO|Sales Manager|Account Manager|Managing Director)$/i.test(lines[i+1]))continue;
  const section=lines.slice(i+1,i+28),family=section.some(line=>knownSupplier(line)?.key===seller);
  if(family && !entries.some(e=>e.name===name))entries.push({email:'',name,source:'signature-name',automated:false});
 }
 const proposed=offer.contactPerson;
 if(proposed){
  const normalized=value=>text(value).replace(/\s+/g,' ').toLowerCase();
  const source=normalized(`${body}\n${message.senderName || ''} <${message.senderEmail || ''}>`);
  const evidence=text(proposed.evidence),supplierEvidence=text(proposed.supplierEvidence),name=personName(proposed.name),email=emailOf(proposed.email);
  const attested=value=>value && normalized(evidence).includes(normalized(value));
  const supplierAttested=supplierEvidence && source.includes(normalized(supplierEvidence))
   && (knownSupplier(supplierEvidence)?.key===seller || replyVerified && supplierEvidence.toLowerCase().includes(reply.split('@')[1]));
  if(name && evidence && source.includes(normalized(evidence)) && attested(name) && !internalIdentity(evidence)
    && (email?trusted(email) && (attested(email) || entries.some(e=>e.email===email && e.name.toLowerCase()===name.toLowerCase())):supplierAttested)){
   const entry={email,name,source:'ai-source-evidence',automated:false,evidence,supplierEvidence,
    telefon:attested(proposed.phone)?text(proposed.phone):'',mobil:attested(proposed.mobile)?text(proposed.mobile):''};
   const same=entries.find(e=>(email && e.email===email || !email && e.name.toLowerCase()===name.toLowerCase()) && (!e.name || e.name.toLowerCase()===name.toLowerCase()));
   if(same)Object.assign(same,entry,{email:email || same.email,telefon:entry.telefon || same.telefon || '',mobil:entry.mobil || same.mobil || ''});else entries.push(entry);
  }
 }
 // An explicitly signed personal address outranks an automated sending mailbox.
 const named=entries.filter(e=>e.name && !e.automated);
 return {version:1,candidates:named.length?named:entries};
}
function resolveSupplierContact(source,contacts=[]) {
 let stored;try{stored=typeof source==='string'?JSON.parse(source):source;}catch{}
 const candidates=Array.isArray(stored?.candidates)?stored.candidates.filter(c=>c && (emailOf(c.email) || personName(c.name))):[];
 if(candidates.length!==1)return {status:candidates.length?'ambiguous':'unknown',selectedId:null,suggestion:null};
 const candidate=candidates[0],email=emailOf(candidate.email);
 const canonical=value=>String(value || '').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('de-DE');
 const matches=contacts.filter(c=>email?[...String(c.email || '').matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)].some(m=>m[0].toLowerCase()===email):personName(candidate.name) && canonical([c.firstName,c.lastName].filter(Boolean).join(' '))===canonical(candidate.name));
 if(matches.length===1 && email && candidate.name && matches[0].firstName && matches[0].lastName
  && canonical([matches[0].firstName,matches[0].lastName].join(' '))!==canonical(candidate.name))return {status:'ambiguous',selectedId:null,suggestion:null};
 if(matches.length===1)return {status:'matched',selectedId:matches[0].id,suggestion:null,evidence:candidate.source};
 if(matches.length>1)return {status:'ambiguous',selectedId:null,suggestion:null};
 // A supplier may have changed its address or use an alias. Match the AI's
 // full source name within this supplier account before proposing a duplicate.
 const named=contacts.filter(c=>personName(candidate.name) && canonical([c.firstName,c.lastName].filter(Boolean).join(' '))===canonical(candidate.name));
 if(named.length===1)return {status:'matched-name',selectedId:named[0].id,suggestion:null,emailMismatch:Boolean(email),evidence:'full-name'};
 if(named.length>1)return {status:'ambiguous',selectedId:null,suggestion:null};
 const words=personName(candidate.name).split(' ').filter(Boolean);
 return {status:'suggested',selectedId:null,suggestion:{email,vorname:words.length>1?words.slice(0,-1).join(' '):'',
  name:words.length>1?words.at(-1):'',telefon:candidate.telefon || '',mobil:candidate.mobil || ''},evidence:candidate.source};
}
module.exports={collectSupplierContacts,resolveSupplierContact,emailOf,personName};

const zlib=require('node:zlib');
const {createHash}=require('node:crypto');
const {DOMParser}=require('@xmldom/xmldom');
const {PDFDocument,PDFName,PDFArray,PDFRawStream,StandardFonts,rgb}=require('pdf-lib');
const {createHttpError}=require('../utils');
const cache=new Map();
const clean=value=>String(value || '').replace(/\s+/g,' ').trim();
const children=node=>Array.from(node?.childNodes || []).filter(child=>child.nodeType===1);
const child=(node,name)=>children(node).find(item=>item.localName===name);
const value=(node,name)=>clean(child(node,name)?.textContent);

function xfaXml(pdf) {
  const form=pdf.context.lookup(pdf.catalog.get(PDFName.of('AcroForm')));
  const ref=form?.get(PDFName.of('XFA'));
  if(!ref)return null;
  const xfa=pdf.context.lookup(ref);
  let stream=xfa instanceof PDFRawStream?xfa:null;
  if(xfa instanceof PDFArray)for(let i=0;i+1<xfa.size();i+=2) {
    if(pdf.context.lookup(xfa.get(i))?.decodeText?.()==='datasets')stream=pdf.context.lookup(xfa.get(i+1));
  }
  if(!(stream instanceof PDFRawStream))throw Error('XFA-Formulardaten fehlen.');
  const filter=stream.dict.get(PDFName.of('Filter'))?.toString();
  if(filter && filter!=='/FlateDecode')throw Error('XFA-Kompression wird nicht unterstützt.');
  const decoded=filter?zlib.inflateSync(Buffer.from(stream.contents),{maxOutputLength:4*1024*1024}):Buffer.from(stream.contents);
  if(decoded.length>4*1024*1024)throw Error('XFA-Formulardaten sind zu groß.');
  return decoded.toString('utf8');
}

function offerLines(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Nicht erlaubte XML-Deklaration.');
  const document=new DOMParser({onError:(level,message)=>{if(level!=='warning')throw Error(message);}}).parseFromString(xml,'application/xml');
  const data=Array.from(document.getElementsByTagName('*')).find(node=>node.localName==='data' && node.namespaceURI==='http://www.xfa.org/schema/xfa-data/1.0/');
  const root=child(child(data,'data'),'DATA') || child(data,'data');
  if(!root)throw Error('Angebotsdaten fehlen.');
  const offer=child(root,'OFFER_CHAR'),lines=[];
  const add=(node,fields)=>{for(const [key,label]of fields){const text=value(node,key);if(text)lines.push({text:`${label}: ${text}`});}};
  lines.push({text:`Angebot ${value(offer,'ZOFFER')}`,heading:true});
  add(offer,[['OFF_MONTH','Angebotsmonat'],['KUNNR','Kundennummer'],['MESSAGE','Nachricht']]);
  add(root,[['REPLYTO','Antwortadresse']]);
  for(const name of ['HEADER','HEADER2'])for(const group of children(child(root,name))) {
    add(group,[['NAME1','Empfänger'],['INCO1','Lieferbedingung'],['WERKS','Werk / Ladeort'],['KONDM','Verpackung'],['ZDEADLINE','Gültig bis'],['LOADDATE','Ladedatum']]);
  }
  const items=children(child(root,'ITEM'));
  if(!items.length || items.length>1000)throw Error('Keine eindeutig lesbaren Angebotspositionen.');
  items.forEach((item,index)=>{
    lines.push({text:`Position ${index+1}`,heading:true});
    add(item,[['PRGRP','Material'],['MATNR','Materialnummer'],['CHARG','Charge'],['ZBTCH_DESC','Beschreibung'],['QUANTITY','Menge'],['PRICE','Preis'],['WAERK','Währung']]);
    for(let i=1;i<=4;i++){const label=value(offer,`ATFLV${i}`),text=value(item,`ATFLV${i}`);if(label && text)lines.push({text:`${label}: ${text}`});}
  });
  return lines;
}

async function readableSourcePdf(content) {
  const bytes=Buffer.from(content),hash=createHash('sha256').update(bytes).digest('hex');
  if(cache.has(hash))return cache.get(hash);
  try {
    const original=await PDFDocument.load(bytes,{ignoreEncryption:false});
    const xml=xfaXml(original);
    if(!xml)return bytes;
    const lines=offerLines(xml),pdf=await PDFDocument.create();
    const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const supported=new Set(font.getCharacterSet());
    let page,y;
    const newPage=()=>{page=pdf.addPage([595.28,841.89]);y=790;page.drawText('Ausgefüllte Originaldaten des Lieferantenangebots',{x:40,y:815,size:8,font,color:rgb(.4,.4,.4)});};
    newPage();
    for(const line of lines) {
      const text=line.text.normalize('NFC');
      if([...text].some(char=>!supported.has(char.codePointAt(0))))throw Error('Nicht unterstützte Schriftzeichen in den Originaldaten.');
      const size=line.heading?14:11,face=line.heading?bold:font;
      if(line.heading)y-=10;
      let current='';
      const chunks=[];
      for(const word of text.split(' ')) {
        // Wrap long identifiers too, without dropping a character.
        for(const char of `${current?' ':''}${word}`){if(face.widthOfTextAtSize(current+char,size)>510){chunks.push(current);current='';}current+=char;}
      }
      if(current)chunks.push(current);
      for(const chunk of chunks){if(y<65)newPage();page.drawText(chunk,{x:40,y,size,font:face});y-=17;}
    }
    pdf.setTitle(`Lieferantenangebot - lesbare Originaldaten`);
    const result=Buffer.from(await pdf.save());
    if(cache.size>=20)cache.delete(cache.keys().next().value);
    cache.set(hash,result);return result;
  } catch(error) {
    throw createHttpError(422,`Das Angebot kann nicht als lesbare PDF dargestellt werden: ${error.message} Bitte die Originaldatei herunterladen.`,{code:'OPTION_PDF_PREVIEW_FAILED'});
  }
}
module.exports={readableSourcePdf,offerLines,xfaXml};

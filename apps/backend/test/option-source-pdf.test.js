const test=require('node:test');
const assert=require('node:assert/strict');
const {PDFDocument,PDFName,PDFString}=require('pdf-lib');
const {offerLines,readableSourcePdf}=require('../src/options/source-pdf');
const xml=`<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><data><DATA>
<OFFER_CHAR><ZOFFER>2038296</ZOFFER><ATFLV1>MFI</ATFLV1></OFFER_CHAR>
<HEADER><DATA><INCO1>FCA</INCO1><KONDM>BAGS</KONDM></DATA></HEADER>
<ITEM><DATA><PRGRP>PPC 4600 OG</PRGRP><QUANTITY>24.750</QUANTITY><PRICE>1170.00</PRICE><ATFLV1>2.290</ATFLV1></DATA></ITEM>
<DRP_DWN><DATA><PRGRP>NEVER ACTUAL MATERIAL</PRGRP></DATA></DRP_DWN>
</DATA></data></xfa:data></xfa:datasets>`;
test('XFA preview uses filled source values and excludes template/dropdown alternatives',async()=>{
  const lines=offerLines(xml).map(line=>line.text).join('\n');
  assert.match(lines,/Material: PPC 4600 OG/);assert.match(lines,/Menge: 24.750/);assert.match(lines,/MFI: 2.290/);
  assert.doesNotMatch(lines,/NEVER ACTUAL MATERIAL/);
  const original=await PDFDocument.create();original.addPage();
  const stream=original.context.register(original.context.flateStream(xml));
  const form=original.context.obj({XFA:[PDFString.of('datasets'),stream]});
  original.catalog.set(PDFName.of('AcroForm'),original.context.register(form));
  const content=Buffer.from(await original.save());
  const preview=await readableSourcePdf(content),pdf=await PDFDocument.load(preview);
  assert.equal(pdf.getPageCount(),1);assert.notDeepEqual(preview,content);
  assert.equal(pdf.catalog.get(PDFName.of('AcroForm')),undefined);
});
test('normal PDFs keep their bytes; malformed or entity-bearing forms fail explicitly',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage();const content=Buffer.from(await pdf.save());
  assert.deepEqual(await readableSourcePdf(content),content);
  assert.throws(()=>offerLines('<!DOCTYPE data [<!ENTITY a "bad">]>'+xml),/XML-Deklaration/);
  assert.throws(()=>offerLines('<data/>'),/Angebotsdaten fehlen/);
  await assert.rejects(readableSourcePdf(Buffer.from('not a PDF')),error=>error.status===422 && error.details.code==='OPTION_PDF_PREVIEW_FAILED');
});

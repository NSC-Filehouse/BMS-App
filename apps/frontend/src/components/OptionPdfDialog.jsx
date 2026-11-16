import React from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Typography,useMediaQuery,useTheme} from '@mui/material';
import {apiRequestBlob} from '../api/client.js';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {useBackDisclosure} from './DisclosureBack.jsx';

// Render inside the App on every browser. Native iOS/Chrome PDF plugins are not
// involved. Originals stay on the server for the later editing/attachment flow.
export default function OptionPdfDialog({offer,onClose}) {
 const small=useMediaQuery(useTheme().breakpoints.down('sm'));
 const [pdf,setPdf]=React.useState(null),[page,setPage]=React.useState(1),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(true);
 const [imageUrl,setImageUrl]=React.useState(''),[width,setWidth]=React.useState(300),[zoom,setZoom]=React.useState(1);
 const [previewFor,setPreviewFor]=React.useState(null);
 const usePreview=previewFor===offer.id;
 const sourceIsPreview=React.useRef(false);
 const viewportRef=React.useRef(null),canvasRef=React.useRef(null),xfaRef=React.useRef(null),bytesRef=React.useRef(null),libRef=React.useRef(null);
 const isPdf=offer.sourceFileMime==='application/pdf' || /\.pdf$/i.test(offer.sourceFileName || '');
 useBackDisclosure(true,onClose);
 React.useEffect(()=>{
  let active=true,task=null,url='';
  setBusy(true);setError('');setPdf(null);setPage(1);bytesRef.current=null;
  void(async()=>{try{
   const blob=await apiRequestBlob(`/options/${offer.id}/source/${isPdf && usePreview?'preview':'file'}`);
   if(!active)return;
   if(!isPdf){url=URL.createObjectURL(blob);setImageUrl(url);setBusy(false);return;}
   const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');lib.GlobalWorkerOptions.workerSrc=workerUrl;libRef.current=lib;
   const data=new Uint8Array(await blob.arrayBuffer());bytesRef.current=data.slice();
   const assets=`${import.meta.env.BASE_URL}pdfjs-assets/`;
   task=lib.getDocument({data,isEvalSupported:false,enableXfa:true,useSystemFonts:true,
    standardFontDataUrl:assets+'standard_fonts/',cMapUrl:assets+'cmaps/',cMapPacked:true,wasmUrl:assets+'wasm/'});
   const loaded=await task.promise;
   if(!active){await task.destroy();return;}
   sourceIsPreview.current=usePreview;
   setPdf(loaded);setBusy(false);
  }catch(e){if(active){
   if(isPdf && !usePreview && e.status!==401 && e.status!==403 && e.code!=='AUTH_REQUIRED')setPreviewFor(offer.id);
   else{setBusy(false);setError(e.message || 'PDF konnte nicht geöffnet werden.');}
  }}})();
  return()=>{active=false;if(url)URL.revokeObjectURL(url);if(task)void task.destroy().catch(()=>{});};
 },[offer.id,isPdf,usePreview]);
 React.useEffect(()=>{
  const target=viewportRef.current;if(!target)return;
  const measure=()=>setWidth(Math.max(220,target.clientWidth-16));measure();
  const observer=new ResizeObserver(measure);observer.observe(target);return()=>observer.disconnect();
 },[busy]);
 React.useEffect(()=>{
  if(!pdf)return;
  let cancelled=false,renderTask=null;
  const renderingPreview=sourceIsPreview.current;
  setError('');
  void(async()=>{try{
   const current=await pdf.getPage(page);if(cancelled)return;
   const natural=current.getViewport({scale:1}),scale=Math.min(4,width/natural.width*zoom),viewport=current.getViewport({scale});
   const layer=xfaRef.current;layer.replaceChildren();
   if(pdf.isPureXfa){
    const xfaHtml=await current.getXfa();if(cancelled)return;
    layer.style.width=`${viewport.width}px`;layer.style.height=`${viewport.height}px`;
    libRef.current.XfaLayer.render({viewport:viewport.clone({dontFlip:true}),div:layer,xfaHtml,annotationStorage:pdf.annotationStorage,
     linkService:{addLinkAttributes:link=>link.removeAttribute('href')},intent:'display'});
    // Viewing only for this delivery. No form value may appear saved when it is not.
    layer.querySelectorAll('input,textarea').forEach(input=>{input.readOnly=true;input.tabIndex=-1;if(['checkbox','radio','submit','button','reset'].includes(input.type))input.disabled=true;});
    layer.querySelectorAll('select,button').forEach(input=>{input.disabled=true;});
   }else{
    const canvas=canvasRef.current,ratio=Math.min(window.devicePixelRatio || 1,2,Math.sqrt(3500000/(viewport.width*viewport.height)));
    canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
    canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
    renderTask=current.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0],annotationMode:libRef.current.AnnotationMode.ENABLE});
    await renderTask.promise;
   }
  }catch(e){if(!cancelled && e.name!=='RenderingCancelledException'){
   if(!renderingPreview)setPreviewFor(offer.id);
   else setError(e.message || 'PDF-Seite konnte nicht angezeigt werden.');
  }}})();
  return()=>{cancelled=true;renderTask?.cancel();};
 },[pdf,page,width,zoom,offer.id]);
 function download(){const url=URL.createObjectURL(new Blob([bytesRef.current],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=`option-${offer.id}.pdf`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return <Dialog open onClose={onClose} fullScreen={small} fullWidth maxWidth="lg"><DialogTitle>{isPdf?'PDF':'Datei'}</DialogTitle>
  <DialogContent ref={viewportRef} sx={{p:1,minHeight:200,overflow:'auto',bgcolor:'#eee'}}>
   {busy && <Box sx={{p:3,textAlign:'center'}}><CircularProgress /></Box>}
   {error && <Alert severity="error">{error}</Alert>}
   {pdf && sourceIsPreview.current && <Alert severity="info" sx={{mb:1}}>Ersatzansicht: Das Original-PDF konnte nicht dargestellt werden.</Alert>}
   {imageUrl && <Box component="img" src={imageUrl} alt="Lieferantenangebot" sx={{maxWidth:'100%'}} />}
   {pdf && <Box sx={{position:'relative',mx:'auto',width:'fit-content',bgcolor:'#fff'}}><canvas ref={canvasRef} style={{display:pdf.isPureXfa?'none':'block'}} /><div ref={xfaRef} className="xfaLayer" style={{position:pdf.isPureXfa?'relative':'absolute'}} /></Box>}
  </DialogContent><DialogActions sx={{flexWrap:'wrap'}}>
   {pdf && <>{pdf.numPages>1 && <><Button disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Zurück</Button><Typography variant="body2">{page} / {pdf.numPages}</Typography><Button disabled={page>=pdf.numPages} onClick={()=>setPage(n=>n+1)}>Weiter</Button></>}<Button aria-label="PDF verkleinern" disabled={zoom<=1} onClick={()=>setZoom(n=>Math.max(1,n-.5))}>−</Button><Button aria-label="PDF vergrößern" disabled={zoom>=3} onClick={()=>setZoom(n=>Math.min(3,n+.5))}>+</Button><Button onClick={download}>Herunterladen</Button></>}
   <Button onClick={onClose}>Schließen</Button>
  </DialogActions></Dialog>;
}

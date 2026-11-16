// The iframe also has an empty sandbox: source mail never runs in the app's origin.
// Block remote resources, including tracking images, while retaining tables/styles.
export function optionMailDocument(body, format, images=[]) {
  const html = /^(?:html|text\/html)$/i.test(String(format || '').trim());
  const escaped = String(body || '').replace(/[&<>"']/g, value => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[value]));
  const normalize=value=>{try{return decodeURIComponent(value).replace(/^<|>$/g,'').toLowerCase();}catch{return value.toLowerCase();}};
  const byCid=new Map(images.filter(image=>/^image\/(?:png|jpeg|gif|webp)$/.test(image.mime) && /^[A-Za-z0-9+/=]+$/.test(image.data)).map(image=>[normalize(image.cid),`data:${image.mime};base64,${image.data}`]));
  const resolved=String(body || '').replace(/(\bsrc\s*=\s*)(["'])cid:([^"']+)\2/gi,(match,prefix,quote,cid)=>byCid.has(normalize(cid))?`${prefix}${quote}${byCid.get(normalize(cid))}${quote}`:match);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>body{margin:12px;font-family:Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto!important}pre{white-space:pre-wrap;font:inherit}</style></head><body>${html ? resolved : `<pre>${escaped}</pre>`}</body></html>`;
}

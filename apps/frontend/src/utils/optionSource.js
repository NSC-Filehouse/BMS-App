// The iframe also has an empty sandbox: source mail never runs in the app's origin.
// Block remote resources, including tracking images, while retaining tables/styles.
export function optionMailDocument(body, format) {
  const html = /^(?:html|text\/html)$/i.test(String(format || '').trim());
  const escaped = String(body || '').replace(/[&<>"']/g, value => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[value]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>body{margin:12px;font-family:Arial,sans-serif;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:inherit}</style></head><body>${html ? body : `<pre>${escaped}</pre>`}</body></html>`;
}

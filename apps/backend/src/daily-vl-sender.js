function normalizeDailyVlSenderName(value) {
  const name = String(value || '').trim()
    // An ASCII-only .env value survives copying through ANSI editors as well.
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Repair the observed ANSI-as-UTF-8 value and the common double-decoded form.
  // Keep the correction limited to this known word; custom names stay intact.
  return name.replace(/\bVerf(?:\uFFFD|\u00C3\u00BC)gbarkeitsliste\b/gi, 'Verf\u00fcgbarkeitsliste');
}

module.exports = { normalizeDailyVlSenderName };

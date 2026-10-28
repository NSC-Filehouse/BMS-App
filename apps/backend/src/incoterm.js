function isFcaIncoterm(value) {
  return /^FCA(?:$|[^A-Z])/i.test(String(value || '').trim());
}

module.exports = { isFcaIncoterm };

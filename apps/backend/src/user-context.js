function firstHeader(req, names) {
  for (const name of names) {
    const value = req.headers[name] || req.headers[String(name).toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+$/.test(String(value || '').trim());
}

function getUserContextFromRequest(req) {
  const givenName = firstHeader(req, ['x-ms-client-given-name']);
  const surname = firstHeader(req, ['x-ms-client-surname']);
  const mail = firstHeader(req, ['x-ms-client-mail']);
  const principalHeader = firstHeader(req, ['x-ms-client-principal-name']);
  const samAccountName = firstHeader(req, ['x-ms-client-samaccountname']);
  const forwardedUser = firstHeader(req, ['x-forwarded-user']);
  const emailCandidates = [mail, principalHeader, forwardedUser].filter(Boolean);
  // The SAM account name is the only authenticated identifier.  Keep the
  // other headers as metadata, but never present a non-email value as an
  // email fallback (for example "filehouse" or "rehder").
  const email = emailCandidates.find(looksLikeEmail) || null;
  const principalName = principalHeader || email || forwardedUser || samAccountName || null;

  const normalizedEmail = String(email || '').trim() || null;

  return {
    email: normalizedEmail,
    mail: mail || null,
    principalName: principalName || null,
    principalHeader: principalHeader || null,
    samAccountName: samAccountName || null,
    forwardedUser: forwardedUser || null,
    givenName: givenName || null,
    surname: surname || null,
  };
}

module.exports = { getUserContextFromRequest };

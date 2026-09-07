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
  const forwardedUser = firstHeader(req, ['x-forwarded-user']);
  const identityCandidates = [principalHeader, mail, forwardedUser].filter(Boolean);
  const email = identityCandidates.find(looksLikeEmail) || identityCandidates[0] || null;
  const principalName = email || principalHeader || forwardedUser || null;

  const normalizedEmail = String(email || '').trim() || null;

  return {
    email: normalizedEmail,
    mail: mail || null,
    principalName: principalName || null,
    givenName: givenName || null,
    surname: surname || null,
  };
}

module.exports = { getUserContextFromRequest };

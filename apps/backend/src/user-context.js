function firstHeader(req, names) {
  for (const name of names) {
    const value = req.headers[name] || req.headers[String(name).toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

function getUserContextFromRequest(req) {
  const givenName = firstHeader(req, ['x-ms-client-given-name']);
  const surname = firstHeader(req, ['x-ms-client-surname']);
  const mail = firstHeader(req, ['x-ms-client-mail']);
  const principalName = firstHeader(req, [
    'x-ms-client-principal-name',
    'x-forwarded-user',
  ]);

  const email = (principalName || mail || '').trim() || null;

  return {
    email,
    mail: mail || null,
    principalName: principalName || null,
    givenName: givenName || null,
    surname: surname || null,
  };
}

module.exports = { getUserContextFromRequest };

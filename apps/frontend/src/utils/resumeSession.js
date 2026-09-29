export async function checkResumeSession(fetchSession) {
  try {
    const response = await fetchSession();
    if (response.status === 401) return { status: 'unauthenticated' };
    if (!response.ok) return { status: 'unavailable' };

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return { status: response.redirected ? 'unauthenticated' : 'unavailable' };
    }

    const me = await response.json();
    if (me?.identityResolved && me?.samAccountName) {
      return { status: 'authenticated', userId: String(me.samAccountName).trim() };
    }
    // /me also returns identityResolved:false when the BMS identity lookup
    // fails. A supplied SSO account still means this is not a login failure.
    return { status: me?.samAccountName ? 'unavailable' : 'unauthenticated' };
  } catch {
    return { status: 'unavailable' };
  }
}

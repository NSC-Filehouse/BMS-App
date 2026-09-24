export function createReturnTo(location, state = location?.state || null) {
  if (!location?.pathname) return null;
  return {
    pathname: location.pathname,
    search: location.search || '',
    hash: location.hash || '',
    state,
  };
}

export function navigateToReturn(navigate, returnTo, fallbackPath, fallbackState = null) {
  const target = returnTo?.pathname
    ? returnTo
    : { pathname: fallbackPath, state: fallbackState };
  const suffix = `${target.search || ''}${target.hash || ''}`;

  navigate(`${target.pathname}${suffix}`, {
    replace: true,
    state: target.state || null,
  });
}

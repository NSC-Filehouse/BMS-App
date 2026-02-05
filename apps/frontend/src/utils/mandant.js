const KEY = 'bms.mandant';

export function getMandant() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setMandant(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // ignore
  }
}

export function clearMandant() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

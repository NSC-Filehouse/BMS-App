const GERMAN_STATE_PROFILES = [
  { key: 'DE-BW', countryCode: 'DE', regionCode: 'BW', name: 'Baden-Württemberg', validityKey: 'validity01', aliases: ['BW', 'BADEN WUERTTEMBERG', 'BADEN WURTTEMBERG'] },
  { key: 'DE-BY', countryCode: 'DE', regionCode: 'BY', name: 'Bayern', validityKey: 'validity02', aliases: ['BY', 'BAYERN'] },
  { key: 'DE-BE', countryCode: 'DE', regionCode: 'BE', name: 'Berlin', validityKey: 'validity03', aliases: ['BE', 'BERLIN'] },
  { key: 'DE-BB', countryCode: 'DE', regionCode: 'BB', name: 'Brandenburg', validityKey: 'validity04', aliases: ['BB', 'BRANDENBURG'] },
  { key: 'DE-HB', countryCode: 'DE', regionCode: 'HB', name: 'Bremen', validityKey: 'validity05', aliases: ['HB', 'BREMEN'] },
  { key: 'DE-HH', countryCode: 'DE', regionCode: 'HH', name: 'Hamburg', validityKey: 'validity06', aliases: ['HH', 'HAMBURG'] },
  { key: 'DE-HE', countryCode: 'DE', regionCode: 'HE', name: 'Hessen', validityKey: 'validity07', aliases: ['HE', 'HESSEN'] },
  { key: 'DE-MV', countryCode: 'DE', regionCode: 'MV', name: 'Mecklenburg-Vorpommern', validityKey: 'validity08', aliases: ['MV', 'M-V', 'MECKLENBURG VORPOMMERN'] },
  { key: 'DE-NI', countryCode: 'DE', regionCode: 'NI', name: 'Niedersachsen', validityKey: 'validity09', aliases: ['NI', 'NDS', 'NIEDERSACHSEN'] },
  { key: 'DE-NW', countryCode: 'DE', regionCode: 'NW', name: 'Nordrhein-Westfalen', validityKey: 'validity10', aliases: ['NW', 'NRW', 'NORDRHEIN WESTFALEN'] },
  { key: 'DE-RP', countryCode: 'DE', regionCode: 'RP', name: 'Rheinland-Pfalz', validityKey: 'validity11', aliases: ['RP', 'RHEINLAND PFALZ'] },
  { key: 'DE-SL', countryCode: 'DE', regionCode: 'SL', name: 'Saarland', validityKey: 'validity12', aliases: ['SL', 'SAARLAND'] },
  { key: 'DE-SN', countryCode: 'DE', regionCode: 'SN', name: 'Sachsen', validityKey: 'validity13', aliases: ['SN', 'SACHSEN'] },
  { key: 'DE-ST', countryCode: 'DE', regionCode: 'ST', name: 'Sachsen-Anhalt', validityKey: 'validity14', aliases: ['ST', 'SACHSEN ANHALT'] },
  { key: 'DE-SH', countryCode: 'DE', regionCode: 'SH', name: 'Schleswig-Holstein', validityKey: 'validity15', aliases: ['SH', 'SCHLESWIG HOLSTEIN'] },
  { key: 'DE-TH', countryCode: 'DE', regionCode: 'TH', name: 'Thüringen', validityKey: 'validity16', aliases: ['TH', 'THUERINGEN', 'THURINGEN'] },
];

// Keep this mapping explicit. New Gültig columns/profiles must be added here
// together with their address-resolution rule and tests.
const FOREIGN_PROFILES = [
  { key: 'BE', countryCode: 'BE', name: 'Belgien', validityKey: 'validity17', aliases: ['B', 'BE', 'BEL', 'BELGIEN', 'BELGIUM'] },
  { key: 'DK', countryCode: 'DK', name: 'Dänemark', validityKey: 'validity18', aliases: ['DK', 'DNK', 'DAENEMARK', 'DANEMARK', 'DENMARK'] },
  { key: 'FR', countryCode: 'FR', name: 'Frankreich', validityKey: 'validity19', aliases: ['F', 'FR', 'FRA', 'FRANKREICH', 'FRANCE'] },
];

const ALL_PROFILES = [...GERMAN_STATE_PROFILES, ...FOREIGN_PROFILES];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/ß/gi, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCountryCode(value) {
  const normalized = normalizeText(value);
  const profile = FOREIGN_PROFILES.find((item) => item.aliases.includes(normalized));
  if (profile) return profile.countryCode;
  if (['DE', 'DEU', 'D', 'GERMANY', 'DEUTSCHLAND'].includes(normalized)) return 'DE';
  return normalized || null;
}

function resolveHolidayProfile(country, region) {
  const countryCode = normalizeCountryCode(country);
  if (countryCode === 'DE') {
    const normalizedRegion = normalizeText(region);
    return GERMAN_STATE_PROFILES.find((profile) => profile.aliases.includes(normalizedRegion)) || null;
  }
  return FOREIGN_PROFILES.find((profile) => profile.countryCode === countryCode) || null;
}

function parseDateKey(value) {
  const text = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { text, year, month, day, date };
}

function isWeekendDate(value) {
  const parsed = parseDateKey(value);
  if (!parsed) return false;
  const day = parsed.date.getUTCDay();
  return day === 0 || day === 6;
}

function addDays(dateKey, amount) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  parsed.date.setUTCDate(parsed.date.getUTCDate() + amount);
  return parsed.date.toISOString().slice(0, 10);
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (typeof value === 'number') return value !== 0;
  return ['1', 'true', 'yes', 'ja'].includes(String(value || '').trim().toLowerCase());
}

function addHolidayRow(index, dateKey, row, profile) {
  if (!dateKey || !isTruthyFlag(row?.[profile.validityKey] ?? row?.[profile.validityColumn])) return;
  const entries = index.get(dateKey) || [];
  const holidayId = row?.holidayId ?? row?.Feiertag_ID ?? null;
  const holidayText = String(row?.holidayText ?? row?.FeiertagText ?? '').trim();
  if (!entries.some((entry) => String(entry.holidayId ?? '') === String(holidayId ?? '') && entry.holidayText === holidayText)) {
    entries.push({
      holidayId,
      holidayText,
      halfDay: isTruthyFlag(row?.halfDay ?? row?.HalbeTag),
    });
  }
  index.set(dateKey, entries);
}

function buildHolidayIndex(rows, profile) {
  const index = new Map();
  if (!profile) return index;
  for (const row of Array.isArray(rows) ? rows : []) {
    addHolidayRow(index, row?.activeDate ?? row?.DatumAktJahr, row, profile);
    addHolidayRow(index, row?.nextDate ?? row?.DatumNextJahr, row, profile);
  }
  return index;
}

function getHolidayStatus(date, profile, rows, index = null) {
  const parsed = parseDateKey(date);
  if (!parsed) return null;
  const holidayIndex = index || buildHolidayIndex(rows, profile);
  const holidays = profile ? holidayIndex.get(parsed.text) || [] : [];
  const firstHoliday = holidays[0] || null;
  return {
    date: parsed.text,
    isWeekend: isWeekendDate(parsed.text),
    isHoliday: Boolean(firstHoliday),
    holidayId: firstHoliday?.holidayId ?? null,
    holidayText: firstHoliday?.holidayText || null,
    halfDay: Boolean(firstHoliday?.halfDay),
    scopeKnown: Boolean(profile),
    showHint: Boolean(profile),
    profile: profile?.key || null,
    profileName: profile?.name || null,
  };
}

function getNextWorkingDate(date, profile, rows, index = null) {
  let candidate = parseDateKey(date)?.text || null;
  if (!candidate) return null;
  const holidayIndex = index || buildHolidayIndex(rows, profile);
  for (let i = 0; i < 370; i += 1) {
    const status = getHolidayStatus(candidate, profile, rows, holidayIndex);
    if (status && !status.isWeekend && !status.isHoliday) return candidate;
    candidate = addDays(candidate, 1);
  }
  return null;
}

function checkDeliveryDates(dates, profile, rows) {
  const holidayIndex = buildHolidayIndex(rows, profile);
  return (Array.isArray(dates) ? dates : [])
    .map((date) => getHolidayStatus(date, profile, rows, holidayIndex))
    .filter(Boolean)
    .map((status) => ({
      ...status,
      suggestedDate: getNextWorkingDate(status.date, profile, rows, holidayIndex),
    }));
}

module.exports = {
  ALL_PROFILES,
  GERMAN_STATE_PROFILES,
  FOREIGN_PROFILES,
  addDays,
  buildHolidayIndex,
  checkDeliveryDates,
  getHolidayStatus,
  getNextWorkingDate,
  isWeekendDate,
  normalizeCountryCode,
  normalizeText,
  parseDateKey,
  resolveHolidayProfile,
};

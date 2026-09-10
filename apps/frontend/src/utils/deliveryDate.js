function parseDateOnly(value) {
  const text = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function isWeekendDate(value) {
  const date = parseDateOnly(value);
  if (!date) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function nextWeekday(from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return dateKey(date);
}

export function getWeekendStatus(date, { showHint = true } = {}) {
  return {
    date: String(date || '').slice(0, 10),
    isWeekend: isWeekendDate(date),
    isHoliday: false,
    holidayText: null,
    scopeKnown: false,
    showHint,
    suggestedDate: isWeekendDate(date) ? nextWeekday(parseDateOnly(date)) : String(date || '').slice(0, 10),
  };
}

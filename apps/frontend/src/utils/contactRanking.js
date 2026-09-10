export function normalizeContactRanking(value) {
  const ranking = Number(value);
  return Number.isInteger(ranking) && ranking >= 1 && ranking <= 3 ? ranking : null;
}

export function getSelectableContactRankings(contacts) {
  const occupied = new Set(
    (Array.isArray(contacts) ? contacts : [])
      .map((contact) => normalizeContactRanking(contact?.ranking))
      .filter(Boolean),
  );
  const nextFree = [1, 2, 3].find((ranking) => !occupied.has(ranking));
  if (nextFree) occupied.add(nextFree);
  return [...occupied].sort((left, right) => left - right);
}

export function getDefaultContactName(contacts) {
  const list = (Array.isArray(contacts) ? contacts : [])
    .filter((contact) => String(contact?.name || '').trim());
  const topContact = list.find((contact) => normalizeContactRanking(contact?.ranking) === 1);
  if (topContact) return String(topContact.name).trim();
  return list.length === 1 ? String(list[0].name).trim() : '';
}

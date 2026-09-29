export function getCustomerDisplayName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  const matchcode = row?.kd_Kurz ? String(row.kd_Kurz).trim() : '';

  if (/[\p{L}\p{N}]/u.test(name1)) return name1;
  if (name1) return matchcode || name2 || name1;
  return name2 || matchcode || '';
}

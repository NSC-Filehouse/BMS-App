export const TEMP_ORDER_STATUS = Object.freeze({
  DRAFT: 0,
  APP_FINALIZED: 1,
  CS_ACCEPTED: 2,
  NEEDS_REWORK: 3,
});

export function normalizeTempOrderStatus(value, legacyCompleted = false) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (text) {
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric >= 0) return numeric;
  }
  return legacyCompleted ? TEMP_ORDER_STATUS.APP_FINALIZED : TEMP_ORDER_STATUS.DRAFT;
}

export function isTempOrderEditableStatus(value, legacyCompleted = false) {
  const status = normalizeTempOrderStatus(value, legacyCompleted);
  return status === TEMP_ORDER_STATUS.DRAFT || status === TEMP_ORDER_STATUS.NEEDS_REWORK;
}

export function isTempOrderFinalizedStatus(value, legacyCompleted = false) {
  const status = normalizeTempOrderStatus(value, legacyCompleted);
  return status === TEMP_ORDER_STATUS.APP_FINALIZED || status === TEMP_ORDER_STATUS.CS_ACCEPTED;
}

export function getTempOrderStatusLabel(t, value, legacyCompleted = false) {
  const status = normalizeTempOrderStatus(value, legacyCompleted);
  const key = {
    [TEMP_ORDER_STATUS.DRAFT]: 'temp_order_status_draft',
    [TEMP_ORDER_STATUS.APP_FINALIZED]: 'temp_order_status_app_finalized',
    [TEMP_ORDER_STATUS.CS_ACCEPTED]: 'temp_order_status_cs_transferred',
    [TEMP_ORDER_STATUS.NEEDS_REWORK]: 'temp_order_status_rework',
  }[status];
  const label = key ? t(key) : t('temp_order_status_unknown', { code: status });
  return `${status} – ${label}`;
}

export function getTempOrderStatusColor(value, legacyCompleted = false) {
  const status = normalizeTempOrderStatus(value, legacyCompleted);
  if (status === TEMP_ORDER_STATUS.NEEDS_REWORK) return 'warning.dark';
  if (status === TEMP_ORDER_STATUS.APP_FINALIZED || status === TEMP_ORDER_STATUS.CS_ACCEPTED) return 'success.main';
  if (status === TEMP_ORDER_STATUS.DRAFT) return 'text.secondary';
  return 'error.main';
}

import React from 'react';
import { useI18n } from '../utils/i18n.jsx';
import { Box, Typography } from '@mui/material';
import { purchaseTotals } from '../utils/purchaseCart.js';

export default function PurchaseOrderSummary({ positions, currency = 'EUR' }) {
  const { lang, t } = useI18n();
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const totals = purchaseTotals(positions);
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'baseline', minWidth: 0, '& .MuiTypography-root': { minWidth: 0, overflowWrap: 'anywhere' } }}>
    <Typography variant="subtitle2">{totals.count} {t(totals.count === 1 ? 'position_singular' : 'position_plural')}</Typography>
    <Typography variant="body2">{t('purchase_total_quantity')} {totals.amount.toLocaleString(locale, { maximumFractionDigits: 3 })} kg</Typography>
    <Typography variant="body2">{t('purchase_total_sum')} {totals.sum === null ? '–' : totals.sum.toLocaleString(locale, { style: 'currency', currency })}</Typography>
  </Box>;
}

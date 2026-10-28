import React from 'react';
import { Box, Typography } from '@mui/material';
import { purchaseTotals } from '../utils/purchaseCart.js';

export default function PurchaseOrderSummary({ positions }) {
  const totals = purchaseTotals(positions);
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'baseline' }}>
    <Typography variant="subtitle2">{totals.count} {totals.count === 1 ? 'Position' : 'Positionen'}</Typography>
    <Typography variant="body2">Gesamtmenge {totals.amount.toLocaleString('de-DE', { maximumFractionDigits: 3 })} kg</Typography>
    <Typography variant="body2">Gesamtsumme {totals.sum === null ? '– (EK oder Menge fehlt)' : totals.sum.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</Typography>
  </Box>;
}

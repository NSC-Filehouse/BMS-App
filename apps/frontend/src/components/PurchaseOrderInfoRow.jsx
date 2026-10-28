import React from 'react';
import { Box, Typography } from '@mui/material';

export default function PurchaseOrderInfoRow({ label, value }) {
  return <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', alignItems: { xs: 'start', md: 'center' }, justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, py: 0.75, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</Typography>
    <Typography variant="body2" sx={{ width: { xs: '100%', md: '60%' }, maxWidth: '100%', minWidth: 0, textAlign: { xs: 'left', md: 'right' }, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value === null || value === undefined || value === '' ? '–' : value}</Typography>
  </Box>;
}

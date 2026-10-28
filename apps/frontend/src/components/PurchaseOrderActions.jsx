import React from 'react';
import { Box } from '@mui/material';

// Same arrangement as the sales-order actions: two columns on phones,
// compact actions on desktop. Wrapping also accommodates long translations.
export default function PurchaseOrderActions({ children }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, max-content)' }, gap: 1, mt: 2, minWidth: 0,
    '& > .MuiButton-root': { minWidth: 0, width: '100%', px: { xs: 1, md: 2 }, whiteSpace: 'normal', overflowWrap: 'anywhere' },
  }}>{children}</Box>;
}

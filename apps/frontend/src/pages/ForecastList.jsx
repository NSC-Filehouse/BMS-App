import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';

export default function ForecastList() {
  const { t } = useI18n();
  return <Box sx={{ width: '100%', maxWidth: 900, mx: 'auto' }}>
    <Typography variant="h5" sx={{ mb: 1.5 }}>{t('forecast_title')}</Typography>
    <Card><CardContent><Typography color="text.secondary">{t('forecast_empty')}</Typography></CardContent></Card>
  </Box>;
}

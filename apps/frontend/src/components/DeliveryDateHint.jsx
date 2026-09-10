import React from 'react';
import { Typography } from '@mui/material';

export default function DeliveryDateHint({ status, t }) {
  if (!status || status.showHint === false || (!status.isWeekend && !status.isHoliday)) return null;

  let text = '';
  if (status.isWeekend && status.isHoliday) {
    text = t('delivery_date_weekend_holiday_hint', { holidayText: status.holidayText || t('delivery_date_holiday_generic') });
  } else if (status.isWeekend) {
    text = t('delivery_date_weekend_hint');
  } else if (status.isHoliday) {
    text = t('delivery_date_holiday_hint', { holidayText: status.holidayText || t('delivery_date_holiday_generic') });
  }

  if (!text) return null;
  return (
    <Typography variant="caption" sx={{ color: '#C56A00', pl: 0.5, mt: -0.35, overflowWrap: 'anywhere' }}>
      {text}
    </Typography>
  );
}

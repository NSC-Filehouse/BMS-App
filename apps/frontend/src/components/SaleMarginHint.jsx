import React from 'react';
import { Typography } from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';

function calculateMarginPercent(salePrice, costPrice) {
  const vk = Number(salePrice);
  const ep = Number(costPrice);
  if (!Number.isFinite(vk) || vk <= 0 || !Number.isFinite(ep) || ep <= 0) return null;
  return ((vk - ep) / vk) * 100;
}

export default function SaleMarginHint({ salePrice, costPrice, sx }) {
  const { lang, t } = useI18n();
  const margin = calculateMarginPercent(salePrice, costPrice);
  if (margin === null) return null;

  const formattedMargin = margin.toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.75, ...sx }}>
      {t('sale_margin_hint', { margin: formattedMargin })}
    </Typography>
  );
}

import React from 'react';
import { Typography } from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';

function calculateMarginPercent(salePrice, costPrice) {
  const vk = Number(salePrice);
  const ep = Number(costPrice);
  if (!Number.isFinite(vk) || vk <= 0 || !Number.isFinite(ep) || ep <= 0) return null;
  return ((vk - ep) / ep) * 100;
}

export default function SaleMarginHint({ salePrice, costPrice, sx }) {
  const { lang, t } = useI18n();
  const ep = Number(costPrice);
  const margin = calculateMarginPercent(salePrice, costPrice);
  if (!Number.isFinite(ep) || ep <= 0) return null;

  const locale = lang === 'en' ? 'en-US' : 'de-DE';
  const formattedCostPrice = ep.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <>
      {margin !== null && (
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.75, ...sx }}>
          {t('sale_margin_hint', {
            margin: margin.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          })}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', mt: margin === null ? -0.75 : -0.25 }}>
        {t('sale_price_hint', { price: `${formattedCostPrice} EUR` })}
      </Typography>
    </>
  );
}

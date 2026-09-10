import React from 'react';
import { Box, Typography } from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';

function calculateMargin(salePrice, costPrice) {
  const vk = Number(salePrice);
  const ep = Number(costPrice);
  if (!Number.isFinite(vk) || vk <= 0 || !Number.isFinite(ep) || ep <= 0) return null;
  const amount = vk - ep;
  return {
    amount,
    percent: (amount / ep) * 100,
  };
}

export default function SaleMarginHint({ salePrice, costPrice, sx }) {
  const { lang, t } = useI18n();
  const ep = Number(costPrice);
  const margin = calculateMargin(salePrice, costPrice);
  if (!Number.isFinite(ep) || ep <= 0) return null;

  const locale = lang === 'en' ? 'en-US' : 'de-DE';
  const formattedCostPrice = ep.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedMarginAmount = margin?.amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedMarginPercent = margin?.percent.toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const marginAmountColor = margin?.amount > 0
    ? 'success.main'
    : margin?.amount < 0
      ? 'error.main'
      : 'text.secondary';

  return (
    <>
      {margin !== null && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25, ...sx }}>
          {t('sale_margin_hint_label')}{' '}
          <Box component="span" sx={{ color: marginAmountColor }}>
            {formattedMarginAmount} EUR
          </Box>{' '}
          ({formattedMarginPercent} %)
        </Typography>
      )}
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
        {t('sale_price_hint', { price: `${formattedCostPrice} EUR` })}
      </Typography>
    </>
  );
}

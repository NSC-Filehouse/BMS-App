import React from 'react';
import { Box, Typography } from '@mui/material';
import { useI18n } from '../utils/i18n.jsx';
import { calculateSaleMarginAmount } from '../utils/saleMargin.js';

export default function SaleMarginHint({ amountInKg, salePrice, costPrice, sx }) {
  const { lang, t } = useI18n();
  const ep = Number(costPrice);
  const marginAmount = calculateSaleMarginAmount(amountInKg, salePrice, costPrice);
  if (!Number.isFinite(ep) || ep <= 0) return null;

  const locale = lang === 'en' ? 'en-US' : 'de-DE';
  const formattedCostPrice = ep.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedMarginAmount = marginAmount?.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const marginAmountColor = marginAmount > 0
    ? 'success.main'
    : marginAmount < 0
      ? 'error.main'
      : 'text.secondary';

  return (
    <>
      {marginAmount !== null && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25, ...sx }}>
          {t('sale_margin_hint_label')}{' '}
          <Box component="span" sx={{ color: marginAmountColor }}>
            {formattedMarginAmount} EUR
          </Box>
        </Typography>
      )}
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
        {t('sale_price_hint', { price: `${formattedCostPrice} EUR` })}
      </Typography>
    </>
  );
}

import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Typography,
} from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function formatDateTime(value, locale) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(locale);
}

function formatAmount(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export default function Timeline() {
  const { lang, t } = useI18n();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest('/timeline');
        if (!alive) return;
        setItems(Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [t]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {t('timeline_title')}
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>{t('timeline_empty')}</Typography>
      )}

      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {items.map((item) => {
            const user = item.userShortCode || '-';
            const product = item.product || item.beNumber || '-';
            const message = item.type === 'reservation'
              ? t('timeline_event_reservation', { user, product })
              : t('timeline_event_order', { user, product, amount: formatAmount(item.amountKg, locale) });

            return (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ display: 'grid', gap: 0.35, py: '10px !important' }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(item.createdAt, locale)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('mandant_label')}: {item.mandant || '-'}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

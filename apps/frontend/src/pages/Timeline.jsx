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

function renderTimelineMessage(item, locale, t) {
  const user = item.userShortCode || '-';
  const product = item.product || item.beNumber || '-';
  const amount = formatAmount(item.amountKg, locale);

  if (item.type === 'reservation') {
    return (
      <>
        <Box component="span" sx={{ fontWeight: 700 }}>{user}</Box>
        {' '}
        {t('timeline_text_has')}
        {' '}
        <Box component="span" sx={{ fontWeight: 700 }}>{amount} KG</Box>
        {' '}
        {t('timeline_text_of')}
        {' '}
        <Box component="span" sx={{ fontWeight: 700 }}>{product}</Box>
        {' '}
        {t('timeline_text_reserved')}
      </>
    );
  }

  return (
    <>
      <Box component="span" sx={{ fontWeight: 700 }}>{user}</Box>
      {' '}
      {t('timeline_text_has')}
      {' '}
      <Box component="span" sx={{ fontWeight: 700 }}>{amount} KG</Box>
      {' '}
      {t('timeline_text_of')}
      {' '}
      <Box component="span" sx={{ fontWeight: 700 }}>{product}</Box>
      {' '}
      {t('timeline_text_ordered')}
    </>
  );
}

function getDateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRelativeDayLabel(dateKey, locale, t) {
  if (!dateKey) return '-';
  const now = new Date();
  const todayKey = getDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday);
  if (dateKey === todayKey) return t('timeline_group_today');
  if (dateKey === yesterdayKey) return t('timeline_group_yesterday');

  const [year, month, day] = String(dateKey).split('-').map((x) => Number(x));
  const d = new Date(year, (month || 1) - 1, day || 1);
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function Timeline() {
  const { lang, t } = useI18n();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const groupedItems = React.useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const item of items) {
      const key = getDateKey(item?.createdAt) || 'unknown';
      if (!currentGroup || currentGroup.key !== key) {
        currentGroup = {
          key,
          label: getRelativeDayLabel(key, locale, t),
          items: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    }

    return groups;
  }, [items, locale, t]);

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
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {groupedItems.map((group) => (
            <Box key={group.key} sx={{ display: 'grid', gap: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  px: 0.5,
                }}
              >
                {group.label}
              </Typography>
              {group.items.map((item) => {
                return (
                  <Card key={item.id} variant="outlined">
                    <CardContent sx={{ display: 'grid', gap: 0.35, py: '10px !important' }}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(item.createdAt, locale)}
                      </Typography>
                      <Typography variant="body2">
                        {renderTimelineMessage(item, locale, t)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t('mandant_label')}: {item.mandant || '-'}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

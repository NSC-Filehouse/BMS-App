import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest, apiRequestBlob } from '../api/client.js';
import { getOrderPdfErrorMessage } from '../utils/orderPdf.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';

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

function formatPrice(value, locale) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function TimelineSeparator() {
  return <Box component="span" sx={{ color: 'text.disabled' }}>·</Box>;
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

function renderOrderMessage(item, locale, t, openOrderPdf, orderPdfLoadingId) {
  const timelineId = String(item?.id || '');
  const isPdfLoading = orderPdfLoadingId === timelineId;
  const customerName = item.customerName || '-';
  const userShortCode = item.userShortCode || '-';
  const amount = formatAmount(item.amountKg, locale);
  const unit = item.unit || 'kg';
  const product = item.product || '-';
  const beNumber = item.beNumber || '-';

  return (
    <Box sx={{ display: 'grid', gap: 0.35, minWidth: 0 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          columnGap: 0.75,
          rowGap: 0.25,
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {item.orderIndex && (
          <>
            <Box
              component="button"
              type="button"
              onClick={(event) => openOrderPdf(event, item)}
              disabled={isPdfLoading}
              aria-label={t('open_order_pdf')}
              sx={{
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                color: 'primary.main',
                textDecoration: 'underline',
                cursor: isPdfLoading ? 'wait' : 'pointer',
                font: 'inherit',
                fontWeight: 700,
              }}
            >
              {item.orderIndex}
            </Box>
            <TimelineSeparator />
          </>
        )}
        <Box component="span" sx={{ fontWeight: 700 }}>{userShortCode}</Box>
        <TimelineSeparator />
        <Box component="span" sx={{ minWidth: 0 }}>{customerName}</Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          columnGap: 0.75,
          rowGap: 0.25,
          minWidth: 0,
          color: 'text.secondary',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        <Box component="span">{t('timeline_amount')}: {amount} {unit}</Box>
        <TimelineSeparator />
        <Box component="span">{t('timeline_article')}: {product}</Box>
        <TimelineSeparator />
        <Box component="span">{t('timeline_sale_price')}: {formatPrice(item.salePrice, locale)}</Box>
        <TimelineSeparator />
        <Box component="span">{t('timeline_be_number')}: {beNumber}</Box>
      </Box>
    </Box>
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
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState('');
  const [orderPdfLoadingId, setOrderPdfLoadingId] = React.useState('');
  const [orderPdfErrors, setOrderPdfErrors] = React.useState({});
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const effectiveQuery = String(searchInput || '').trim().toLowerCase();
  const filteredItems = React.useMemo(() => {
    if (!effectiveQuery) return items;
    return items.filter((item) => {
      const product = String(item?.product || item?.beNumber || '').toLowerCase();
      const shortCode = String(item?.userShortCode || '').toLowerCase();
      const orderIndex = String(item?.orderIndex || '').toLowerCase();
      return product.includes(effectiveQuery)
        || shortCode.includes(effectiveQuery)
        || orderIndex.includes(effectiveQuery);
    });
  }, [effectiveQuery, items]);
  const groupedItems = React.useMemo(() => {
    const groups = [];
    let currentGroup = null;

    for (const item of filteredItems) {
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
  }, [filteredItems, locale, t]);

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

  const openOrderPdf = React.useCallback(async (event, item) => {
    event.preventDefault();
    const timelineId = String(item?.id || '').trim();
    if (!timelineId) return;

    const popup = window.open('', '_blank');
    if (!popup) {
      setOrderPdfErrors((previous) => ({
        ...previous,
        [timelineId]: t('order_pdf_popup_blocked'),
      }));
      return;
    }

    setOrderPdfLoadingId(timelineId);
    setOrderPdfErrors((previous) => {
      const next = { ...previous };
      delete next[timelineId];
      return next;
    });
    try {
      const blob = await apiRequestBlob(`/timeline/${encodeURIComponent(timelineId)}/order-pdf`);
      const objectUrl = URL.createObjectURL(blob);
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      popup.close();
      setOrderPdfErrors((previous) => ({
        ...previous,
        [timelineId]: getOrderPdfErrorMessage(e, t),
      }));
    } finally {
      setOrderPdfLoadingId('');
    }
  }, [t]);

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, minWidth: 0 }}>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {t('timeline_title')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            aria-label="timeline-search-toggle"
            onClick={() => {
              if (searchOpen) {
                setSearchInput('');
                setSearchOpen(false);
                return;
              }
              setSearchOpen(true);
            }}
          >
            <SearchIcon />
          </IconButton>
          <IconButton
            aria-label="open-push-settings"
            onClick={() => navigate('/settings', { state: { returnTo: createReturnTo(location) } })}
          >
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      {searchOpen && (
        <TextField
          fullWidth
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          autoFocus
          placeholder={t('timeline_search')}
          sx={{ mb: 1.25 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ opacity: 0.65 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="clear-search"
                  onClick={() => {
                    setSearchInput('');
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && filteredItems.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>{t('timeline_empty')}</Typography>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {groupedItems.map((group) => (
            <Box key={group.key} sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
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
                  <Card key={item.id} variant="outlined" sx={{ width: '100%', minWidth: 0 }}>
                    <CardContent sx={{ display: 'grid', gap: 0.35, py: '10px !important', minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {formatDateTime(item.createdAt, locale)}
                      </Typography>
                      <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {item.type === 'order'
                          ? renderOrderMessage(item, locale, t, openOrderPdf, orderPdfLoadingId)
                          : renderTimelineMessage(item, locale, t)}
                      </Typography>
                      {orderPdfErrors[String(item.id || '')] && (
                        <Typography variant="caption" sx={{ color: 'error.main' }}>
                          {orderPdfErrors[String(item.id || '')]}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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

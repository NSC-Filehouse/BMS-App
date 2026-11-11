import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { SEARCH_MIN } from '../config.js';
import { money, offerStatus } from '../utils/offers.js';
import { createReturnTo } from '../utils/navigation.js';

export default function TempOffersList() {
  const { lang, t } = useI18n();
  const en = lang === 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state?.listState || {};
  const [q, setQ] = React.useState(initial.q || '');
  const [search, setSearch] = React.useState(initial.q || '');
  const [status, setStatus] = React.useState(initial.status || 'all');
  const [period, setPeriod] = React.useState(initial.period || 'all');
  const [page, setPage] = React.useState(initial.page || 1);
  const [customerId, setCustomerId] = React.useState(initial.customerId || '');
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    const h = setTimeout(() => {
      const value = search.trim();
      if (value && value.length < SEARCH_MIN) return;
      setQ(value);
      if (value !== q) setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [search, q]);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiRequest(
      `/temp-offers?${new URLSearchParams({ q, status, period, customerId, page: String(page), pageSize: '12' })}`,
    )
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [q, status, period, page, customerId]);
  const returnTo = createReturnTo(location, {
    listState: { q, status, period, page, customerId },
  });
  const pages = Math.max(1, Math.ceil((result?.meta?.total || 0) / 12));
  return (
    <Box
      sx={{
        maxWidth: 900,
        width: '100%',
        minWidth: 0,
        mx: 'auto',
        height: 'calc(100vh - 96px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          mb: 2,
          minWidth: 0,
        }}
      >
        <Typography
          variant="h5"
          sx={{ mr: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {en ? 'Offers' : 'Angebote'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <IconButton
            aria-label={en ? 'Previous page' : 'Vorherige Seite'}
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography
            variant="body2"
            sx={{ minWidth: 80, textAlign: 'center' }}
          >
            {t('page_label')} {page}/{pages}
          </Typography>
          <IconButton
            aria-label={en ? 'Next page' : 'Nächste Seite'}
            disabled={loading || page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ArrowForwardIcon />
          </IconButton>
          <IconButton
            aria-label={en ? 'New offer' : 'Neues Angebot'}
            color="primary"
            onClick={() =>
              navigate('/temp-offers/new', { state: { returnTo } })
            }
          >
            <AddIcon />
          </IconButton>
        </Box>
      </Box>
      <Card sx={{ mb: 2, flexShrink: 0 }}>
        <CardContent sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
          <Box
            sx={{
              display: { xs: 'grid', md: 'flex' },
              alignItems: 'center',
              gap: 1,
              minWidth: 0,
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder={
                en
                  ? 'Search customer, article, reference'
                  : 'Kunde, Artikel, Referenz suchen'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ opacity: 0.6 }} />
                  </InputAdornment>
                ),
              }}
            />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={status}
              aria-label={t('temp_order_status')}
              onChange={(_, v) => {
                if (v) {
                  setStatus(v);
                  setPage(1);
                }
              }}
              sx={{
                ml: { xs: 0, md: 1 },
                justifySelf: 'start',
                maxWidth: '100%',
                flexWrap: 'wrap',
              }}
            >
              <ToggleButton value="all">
                {t('temp_orders_status_all')}
              </ToggleButton>
              <ToggleButton value="draft">
                {t('temp_orders_status_draft')}
              </ToggleButton>
              <ToggleButton value="rework">
                {t('temp_orders_status_rework')}
              </ToggleButton>
              <ToggleButton value="sent">
                {en ? 'Released' : 'Freigegeben'}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('temp_orders_period_label')}
            </Typography>
            <RadioGroup
              row
              value={period}
              aria-label={t('temp_orders_period_label')}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
            >
              <FormControlLabel
                value="today"
                control={<Radio size="small" />}
                label={t('temp_orders_period_today')}
                sx={{ mr: 1 }}
              />
              <FormControlLabel
                value="week"
                control={<Radio size="small" />}
                label={t('temp_orders_period_week')}
                sx={{ mr: 1 }}
              />
              <FormControlLabel
                value="all"
                control={<Radio size="small" />}
                label={t('temp_orders_period_all')}
                sx={{ mr: 0 }}
              />
            </RadioGroup>
          </Box>
          {customerId && (
            <Typography variant="caption">
              {en ? 'Customer' : 'Kunde'} {customerId}{' '}
              <Box
                component="button"
                onClick={() => {
                  setCustomerId('');
                  setPage(1);
                }}
              >
                {en ? 'Show all' : 'Alle anzeigen'}
              </Box>
            </Typography>
          )}
        </CardContent>
      </Card>
      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && !error && !result?.data?.length && (
          <Typography sx={{ opacity: 0.7 }}>
            {en ? 'No offers found.' : 'Keine Angebote gefunden.'}
          </Typography>
        )}
        {!loading && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {(result?.data || []).map((o) => (
              <Card
                key={o.id}
                sx={{
                  borderRadius: 2,
                  border: '1px solid rgba(0,0,0,.08)',
                  boxShadow: '0 4px 10px rgba(0,0,0,.05)',
                  cursor: 'pointer',
                  width: '100%',
                  minWidth: 0,
                }}
                onClick={() =>
                  navigate(`/temp-offers/${o.id}`, { state: { returnTo } })
                }
              >
                <CardContent
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    minWidth: 0,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                        columnGap: 1,
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={700}>
                        {o.createdBy}
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{ overflowWrap: 'anywhere' }}
                      >
                        {o.customerName || `AN-${o.id}`}
                      </Typography>
                      {o.bmsOfferNumber && (
                        <Typography variant="subtitle1">
                          {o.bmsOfferNumber}
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: o.status === 3 ? 'warning.main' : 'primary.main',
                      }}
                    >
                      {offerStatus(o.status, en)}
                    </Typography>
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      {new Date(o.createdAt).toLocaleDateString('de-DE')}
                    </Typography>
                    {(o.positions || []).map((p, i) => (
                      <Box key={i} sx={{ mt: 0.75 }}>
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          sx={{ overflowWrap: 'anywhere' }}
                        >
                          {p.article}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('product_amount')}: {p.quantity} {p.unit} |{' '}
                          {t('order_sale_price')}: {money(p.price)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <ChevronRightIcon sx={{ opacity: 0.6 }} />
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

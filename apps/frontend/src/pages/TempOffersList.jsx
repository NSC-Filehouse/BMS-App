import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { money, offerStatus } from '../utils/offers.js';
import { createReturnTo } from '../utils/navigation.js';

export default function TempOffersList() {
  const { lang } = useI18n();
  const en = lang === 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state?.listState || {};
  const [q, setQ] = React.useState(initial.q || '');
  const [status, setStatus] = React.useState(initial.status || 'all');
  const [period, setPeriod] = React.useState(initial.period || 'all');
  const [page, setPage] = React.useState(initial.page || 1);
  const [customerId, setCustomerId] = React.useState(initial.customerId || '');
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState(q);
  React.useEffect(() => {
    const h = setTimeout(() => {
      setQ(search.trim());
      if (search.trim() !== q) setPage(1);
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
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>
          {en ? 'My offers' : 'Meine Angebote'}
        </Typography>
        <IconButton
          aria-label={en ? 'New offer' : 'Neues Angebot'}
          color="primary"
          onClick={() => navigate('/temp-offers/new', { state: { returnTo } })}
        >
          <AddIcon />
        </IconButton>
      </Box>
      <Card>
        <CardContent sx={{ display: 'grid', gap: 1 }}>
          <TextField
            size="small"
            label={
              en
                ? 'Search customer, article, title, reference'
                : 'Kunde, Artikel, Titel, Referenz suchen'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {customerId && (
            <Chip
              label={`${en ? 'Customer' : 'Kunde'} ${customerId}`}
              onDelete={() => {
                setCustomerId('');
                setPage(1);
              }}
            />
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="all">{en ? 'All' : 'Alle'}</MenuItem>
              {[0, 1, 2, 3].map((s) => (
                <MenuItem key={s} value={String(s)}>
                  {offerStatus(s, en)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label={en ? 'Created' : 'Erstellt'}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 160 }}
            >
              {[
                ['all', en ? 'All' : 'Alle'],
                ['today', en ? 'Today' : 'Heute'],
                ['week', en ? 'Last 7 days' : 'Letzte 7 Tage'],
              ].map(([v, label]) => (
                <MenuItem key={v} value={v}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </CardContent>
      </Card>
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <CircularProgress />
      ) : (
        (result?.data || []).map((o) => (
          <Card key={o.id}>
            <CardActionArea
              onClick={() =>
                navigate(`/temp-offers/${o.id}`, { state: { returnTo } })
              }
            >
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography fontWeight={700}>
                    {o.bmsOfferNumber || `AN-${o.id}`} · {o.customerName}
                  </Typography>
                  <Chip size="small" label={offerStatus(o.status, en)} />
                </Box>
                <Typography>{o.title}</Typography>
                <Typography variant="caption">
                  {String(o.offerDate).slice(0, 10)} · {o.createdBy} ·{' '}
                  {money(o.totalAmount, o.currency)}
                </Typography>
                {(o.positions || []).map((p, i) => (
                  <Typography key={i} variant="body2" sx={{ mt: 0.3 }}>
                    {i + 1}. {p.article} ·{' '}
                    {Number(p.quantity).toLocaleString('de-DE')} {p.unit} ·{' '}
                    {p.price} {o.currency}/{p.priceBasis} {p.unit}
                  </Typography>
                ))}
              </CardContent>
            </CardActionArea>
          </Card>
        ))
      )}
      {!loading && !error && !result?.data?.length && (
        <Typography>
          {en ? 'No offers found.' : 'Keine Angebote gefunden.'}
        </Typography>
      )}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <IconButton
          aria-label={en ? 'Previous page' : 'Vorherige Seite'}
          disabled={page === 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography>
          {page} / {Math.max(1, Math.ceil((result?.meta?.total || 0) / 12))}
        </Typography>
        <IconButton
          aria-label={en ? 'Next page' : 'Nächste Seite'}
          disabled={loading || page * 12 >= (result?.meta?.total || 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          <ArrowForwardIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

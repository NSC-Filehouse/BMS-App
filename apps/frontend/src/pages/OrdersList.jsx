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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddIcon from '@mui/icons-material/Add';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';

const PAGE_SIZE = 12;

export default function OrdersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [items, setItems] = React.useState([]);
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  const [scope, setScope] = React.useState('mine');

  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);
  const scopeRef = React.useRef(scope);
  const hydratedFromStateRef = React.useRef(false);
  const skipSearchReloadRef = React.useRef(false);
  React.useEffect(() => {
    metaRef.current = meta;
  }, [meta]);
  React.useEffect(() => {
    qRef.current = q;
  }, [q]);
  React.useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const load = React.useCallback(async (opts = {}) => {
    const currentMeta = metaRef.current || {};
    const page = opts.page ?? currentMeta.page ?? 1;
    const pageSize = PAGE_SIZE;
    const qVal = opts.q ?? qRef.current ?? '';
    const scopeVal = opts.scope ?? scopeRef.current ?? 'mine';
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/orders?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}&scope=${encodeURIComponent(scopeVal)}&sort=au_Auftragsdatum&dir=DESC`);
      const rows = res?.data || [];
      setItems(rows.slice(0, PAGE_SIZE));
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      setError(e?.message || t('loading_orders_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    if (hydratedFromStateRef.current) return;
    hydratedFromStateRef.current = true;

    const listState = location.state?.listState;
    if (listState && (listState.page || listState.q !== undefined)) {
      const restoredQ = String(listState.q || '');
      const restoredPage = Number(listState.page) > 0 ? Number(listState.page) : 1;
      const restoredScope = String(listState.scope || 'mine') === 'all' ? 'all' : 'mine';
      skipSearchReloadRef.current = true;
      setQ(restoredQ);
      setScope(restoredScope);
      load({ page: restoredPage, q: restoredQ, scope: restoredScope });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    load({ page: 1, q: '', scope: 'mine' });
  }, [load, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const qVal = q.trim();
      if (skipSearchReloadRef.current) {
        skipSearchReloadRef.current = false;
        return;
      }
      if (qVal.length === 0 || qVal.length >= SEARCH_MIN) {
        load({ page: 1, q: qVal, scope });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q, scope, load]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ mr: 1 }}>
          {t('orders_title')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <IconButton
            aria-label="zurueck"
            onClick={() => load({ page: Math.max((meta.page || 1) - 1, 1), q })}
            disabled={(meta.page || 1) <= 1}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 64, textAlign: 'center' }}>
            {t('page_label')} {meta.page || 1}
          </Typography>
          <IconButton
            aria-label="weiter"
            onClick={() => load({ page: (meta.page || 1) + 1, q })}
            disabled={meta.total !== null && meta.total !== undefined
              ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total
              : false}
          >
            <ArrowForwardIcon />
          </IconButton>
          <IconButton aria-label={t('order_add')} color="primary" onClick={() => navigate('/orders/new')}>
            <AddIcon />
          </IconButton>
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('orders_search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
            value={scope}
            onChange={(e, value) => {
              if (!value) return;
              setScope(value);
              load({ page: 1, q, scope: value });
            }}
            sx={{ ml: 1 }}
          >
            <ToggleButton value="mine">{t('orders_scope_mine')}</ToggleButton>
            <ToggleButton value="all">{t('orders_scope_all')}</ToggleButton>
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>{t('orders_empty')}</Typography>
      )}

      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((row) => (
            <Card
              key={row.id}
              sx={{
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/orders/${encodeURIComponent(row.id)}`, {
                state: { fromOrders: { page: meta.page || 1, q, scope } },
              })}
            >
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                  <Box sx={{ pr: 2 }}>
                    <Typography variant="subtitle1">
                      {row.orderNumber || row.id}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ opacity: 0.7 }}>
                        {row.clientName || '-'}
                      </Typography>
                      {scope === 'all' && (
                        <Typography variant="caption" sx={{ opacity: 0.7, whiteSpace: 'nowrap' }}>
                          {row.reservedBy || '-'}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                    <ChevronRightIcon />
                </Box>
              </CardContent>
            </Card>
          ))}

        </Box>
      )}
      </Box>
    </Box>
  );
}

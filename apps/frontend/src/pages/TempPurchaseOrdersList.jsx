import React from 'react';
import { Alert, Badge, Box, Card, CardContent, CircularProgress, FormControlLabel, IconButton, InputAdornment, Radio, RadioGroup, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';
import { getPurchaseCartCount, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';
import { getTempOrderStatusColor, getTempOrderStatusLabel } from '../utils/tempOrderStatus.js';
import { formatPurchaseDate, formatPurchaseNumber, formatPurchasePrice } from '../utils/purchaseOrderDisplay.js';

const PAGE_SIZE = 12;
export default function TempPurchaseOrdersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const initial = location.state?.listState || {};
  const [items, setItems] = React.useState([]);
  const [meta, setMeta] = React.useState({ page: Number(initial.page) || 1, pageSize: PAGE_SIZE, total: null });
  const [q, setQ] = React.useState(initial.q || '');
  const [status, setStatus] = React.useState(['draft', 'sent', 'rework'].includes(initial.status) ? initial.status : 'all');
  const [ownerScope, setOwnerScope] = React.useState(initial.ownerScope === 'mine' ? 'mine' : 'all');
  const [createdPeriod, setCreatedPeriod] = React.useState(['today', 'week'].includes(initial.createdPeriod) ? initial.createdPeriod : 'all');
  const [canViewAll, setCanViewAll] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [cartCount, setCartCount] = React.useState(getPurchaseCartCount);
  const current = React.useRef(null);
  current.current = { page: meta.page, q, status, ownerScope, createdPeriod };
  const requestId = React.useRef(0);
  const previousQuery = React.useRef(q);
  const load = React.useCallback(async (patch = {}) => {
    const state = { ...current.current, ...patch };
    const request = ++requestId.current;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ ...state, pageSize: PAGE_SIZE, sort: 'createdAt', dir: 'DESC' });
      const response = await apiRequest(`/temp-purchase-orders?${query}`);
      if (request !== requestId.current) return;
      const lastPage = response.meta?.total == null ? state.page : Math.max(1, Math.ceil(response.meta.total / (response.meta.pageSize || PAGE_SIZE)));
      if (state.page > lastPage) { await load({ ...state, page: lastPage }); return; }
      setItems(Array.isArray(response.data) ? response.data : []);
      setMeta(response.meta || { page: state.page, pageSize: PAGE_SIZE, total: null });
      if (response.meta?.status) setStatus(response.meta.status);
      if (response.meta?.ownerScope) setOwnerScope(response.meta.ownerScope);
      if (response.meta?.createdPeriod) setCreatedPeriod(response.meta.createdPeriod);
      setCanViewAll(Boolean(response.meta?.canViewAll));
    } catch (e) { if (request === requestId.current) setError(e.message || t('loading_error')); }
    finally { if (request === requestId.current) setLoading(false); }
  }, [t]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (previousQuery.current === q) return undefined;
    previousQuery.current = q;
    const handle = setTimeout(() => { if (!q.trim() || q.trim().length >= SEARCH_MIN) void load({ page: 1, q: q.trim() }); }, 300);
    return () => clearTimeout(handle);
  }, [q, load]);
  React.useEffect(() => {
    const sync = () => setCartCount(getPurchaseCartCount());
    window.addEventListener(PURCHASE_CART_CHANGED, sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(PURCHASE_CART_CHANGED, sync); window.removeEventListener('storage', sync); };
  }, []);
  const pages = meta.total == null ? '?' : Math.max(1, Math.ceil(meta.total / (meta.pageSize || PAGE_SIZE)));
  const returnTo = () => createReturnTo(location, { listState: current.current });
  return <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2, minWidth: 0 }}>
      <Typography variant="h5" sx={{ mr: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{t('temp_purchase_orders_title')}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', minWidth: 0 }}>
        <IconButton aria-label="Vorherige Seite" disabled={loading || (meta.page || 1) <= 1} onClick={() => load({ page: Math.max(1, meta.page - 1) })}><ArrowBackIcon /></IconButton>
        <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>{t('page_label')} {meta.page || 1}/{pages}</Typography>
        <IconButton aria-label="Nächste Seite" disabled={loading || (meta.total != null && (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total)} onClick={() => load({ page: (meta.page || 1) + 1 })}><ArrowForwardIcon /></IconButton>
        <IconButton color="primary" aria-label="Bestellwarenkorb" onClick={() => navigate('/purchase-cart', { state: { returnTo: returnTo() } })}><Badge badgeContent={cartCount} color="error"><AddShoppingCartIcon /></Badge></IconButton>
      </Box>
    </Box>
    <Card sx={{ mb: 2, minWidth: 0, flexShrink: 0 }}><CardContent sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
      <Box sx={{ display: { xs: 'grid', md: 'flex' }, alignItems: 'center', gap: 1, minWidth: 0 }}>
        <TextField fullWidth size="small" sx={{ minWidth: 0 }} placeholder={t('temp_purchase_orders_search')} value={q} onChange={(e) => setQ(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ opacity: 0.6 }} /></InputAdornment> }} />
        <ToggleButtonGroup size="small" exclusive value={status} aria-label={t('temp_order_status')} onChange={(_e, value) => { if (value) { setStatus(value); void load({ page: 1, status: value }); } }} sx={{ ml: { xs: 0, md: 1 }, justifySelf: 'start', maxWidth: '100%', flexWrap: 'wrap' }}>
          <ToggleButton value="all">{t('temp_orders_status_all')}</ToggleButton><ToggleButton value="draft">{t('temp_orders_status_draft')}</ToggleButton><ToggleButton value="rework">{t('temp_orders_status_rework')}</ToggleButton><ToggleButton value="sent">{t('temp_orders_status_sent')}</ToggleButton>
        </ToggleButtonGroup>
        {canViewAll && <FormControlLabel control={<Switch size="small" checked={ownerScope === 'mine'} onChange={(e) => { const value = e.target.checked ? 'mine' : 'all'; setOwnerScope(value); void load({ page: 1, ownerScope: value }); }} />} label={t('temp_orders_scope_mine')} sx={{ ml: { xs: 0, md: 1 }, mr: 0, whiteSpace: 'nowrap' }} />}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">{t('temp_orders_period_label')}</Typography>
        <RadioGroup row value={createdPeriod} aria-label={t('temp_orders_period_label')} onChange={(e) => { setCreatedPeriod(e.target.value); void load({ page: 1, createdPeriod: e.target.value }); }}>
          <FormControlLabel value="today" control={<Radio size="small" />} label={t('temp_orders_period_today')} sx={{ mr: 1 }} /><FormControlLabel value="week" control={<Radio size="small" />} label={t('temp_orders_period_week')} sx={{ mr: 1 }} /><FormControlLabel value="all" control={<Radio size="small" />} label={t('temp_orders_period_all')} sx={{ mr: 0 }} />
        </RadioGroup>
      </Box>
    </CardContent></Card>
    <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!loading && !error && !items.length && <Typography color="text.secondary">{t('temp_purchase_orders_empty')}</Typography>}
      {!loading && !error && <Box sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
        {items.map((item) => <Card key={item.id} sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', cursor: 'pointer', width: '100%', minWidth: 0 }} onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(item.id)}`, { state: { listState: current.current, returnTo: returnTo() } })}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{item.createdBy || '–'}</Typography>
                <Typography variant="subtitle1" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.supplierName || item.supplierId}</Typography>
                {item.bmsPurchaseOrderNumber && <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', overflowWrap: 'anywhere' }}>BE: {item.bmsPurchaseOrderNumber}</Typography>}
              </Box>
              <Typography variant="caption" sx={{ color: getTempOrderStatusColor(item.status), fontWeight: 600 }}>{getTempOrderStatusLabel(t, item.status)}</Typography>
              {(item.positions || []).map((p, index) => <Box key={p.id || index} sx={{ mt: 0.75, minWidth: 0 }}>
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{index + 1}. {formatPurchaseNumber(p.amount)} kg · {p.article || '–'} · EK: {formatPurchasePrice(p.purchasePrice, p.currency)}</Typography>
                <Typography variant="caption" color="text.secondary">Liefertermin: {formatPurchaseDate(p.requestedDeliveryDate)}</Typography>
              </Box>)}
            </Box>
            <Box sx={{ width: 38, minWidth: 38, flex: '0 0 38px', display: 'flex', justifyContent: 'center' }}><ChevronRightIcon /></Box>
          </CardContent>
        </Card>)}
      </Box>}
    </Box>
  </Box>;
}

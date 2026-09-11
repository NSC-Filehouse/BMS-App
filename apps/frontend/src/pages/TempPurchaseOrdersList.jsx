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
  Badge,
} from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';
import { getPurchaseCartCount, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';
import { getTempOrderStatusColor, getTempOrderStatusLabel } from '../utils/tempOrderStatus.js';

const PAGE_SIZE = 12;

function formatDateOnly(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('de-DE');
}

export default function TempPurchaseOrdersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [items, setItems] = React.useState([]);
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [ownerScope, setOwnerScope] = React.useState('all');
  const [canViewAll, setCanViewAll] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [cartCount, setCartCount] = React.useState(() => getPurchaseCartCount());

  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);
  const statusRef = React.useRef(status);
  const ownerScopeRef = React.useRef(ownerScope);
  const hydratedFromStateRef = React.useRef(false);
  const skipSearchReloadRef = React.useRef(false);
  React.useEffect(() => { metaRef.current = meta; }, [meta]);
  React.useEffect(() => { qRef.current = q; }, [q]);
  React.useEffect(() => { statusRef.current = status; }, [status]);
  React.useEffect(() => { ownerScopeRef.current = ownerScope; }, [ownerScope]);

  const totalPages = meta.total !== null && meta.total !== undefined
    ? Math.max(1, Math.ceil(Number(meta.total) / (meta.pageSize || PAGE_SIZE)))
    : null;

  const load = React.useCallback(async (opts = {}) => {
    const currentMeta = metaRef.current || {};
    const page = opts.page ?? currentMeta.page ?? 1;
    const qValue = opts.q ?? qRef.current ?? '';
    const statusValue = opts.status ?? statusRef.current ?? 'all';
    const ownerScopeValue = opts.ownerScope ?? ownerScopeRef.current ?? 'all';
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest(
        `/temp-purchase-orders?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(qValue)}&status=${encodeURIComponent(statusValue)}&ownerScope=${encodeURIComponent(ownerScopeValue)}&sort=createdAt&dir=DESC`,
      );
      setItems(Array.isArray(response?.data) ? response.data : []);
      const nextMeta = response?.meta || { page, pageSize: PAGE_SIZE, total: null };
      setMeta(nextMeta);
      if (nextMeta.status) setStatus(nextMeta.status);
      if (nextMeta.ownerScope) setOwnerScope(nextMeta.ownerScope);
      if (nextMeta.canViewAll !== undefined) setCanViewAll(Boolean(nextMeta.canViewAll));
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    if (hydratedFromStateRef.current) return;
    hydratedFromStateRef.current = true;
    const listState = location.state?.listState;
    if (listState && (listState.page || listState.q !== undefined || listState.status !== undefined || listState.ownerScope !== undefined)) {
      const restoredQ = String(listState.q || '');
      const restoredPage = Number(listState.page) > 0 ? Number(listState.page) : 1;
      const restoredStatus = ['all', 'draft', 'sent', 'rework'].includes(String(listState.status || '')) ? String(listState.status) : 'all';
      const restoredOwnerScope = String(listState.ownerScope || '') === 'mine' ? 'mine' : 'all';
      skipSearchReloadRef.current = true;
      setQ(restoredQ);
      setStatus(restoredStatus);
      setOwnerScope(restoredOwnerScope);
      load({ page: restoredPage, q: restoredQ, status: restoredStatus, ownerScope: restoredOwnerScope });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    load({ page: 1, q: '', status: 'all', ownerScope: 'all' });
  }, [load, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const qValue = q.trim();
      if (skipSearchReloadRef.current) {
        skipSearchReloadRef.current = false;
        return;
      }
      if (qValue.length === 0 || qValue.length >= SEARCH_MIN) load({ page: 1, q: qValue });
    }, 300);
    return () => clearTimeout(handle);
  }, [q, load]);

  React.useEffect(() => {
    const sync = () => setCartCount(getPurchaseCartCount());
    window.addEventListener(PURCHASE_CART_CHANGED, sync);
    window.addEventListener('storage', sync);
    sync();
    return () => {
      window.removeEventListener(PURCHASE_CART_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2, minWidth: 0 }}>
        <Typography variant="h5" sx={{ mr: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t('temp_purchase_orders_title')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <IconButton aria-label="zurueck" onClick={() => load({ page: Math.max((meta.page || 1) - 1, 1), q, status, ownerScope })} disabled={(meta.page || 1) <= 1}><ArrowBackIcon /></IconButton>
          <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>{t('page_label')} {meta.page || 1}/{totalPages || '?'}</Typography>
          <IconButton aria-label="weiter" onClick={() => load({ page: (meta.page || 1) + 1, q, status, ownerScope })} disabled={meta.total !== null && meta.total !== undefined ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total : false}><ArrowForwardIcon /></IconButton>
          <IconButton color="primary" onClick={() => navigate('/purchase-cart')} aria-label={t('temp_purchase_cart_title')}><Badge badgeContent={cartCount} color="error"><AddShoppingCartIcon /></Badge></IconButton>
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: { xs: 'grid', md: 'flex' }, alignItems: 'center', gap: 1, minWidth: 0 }}>
          <TextField fullWidth size="small" sx={{ minWidth: 0 }} placeholder={t('temp_purchase_orders_search')} value={q} onChange={(e) => setQ(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ opacity: 0.6 }} /></InputAdornment> }} />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={status}
            aria-label={t('temp_order_status')}
            onChange={(e, value) => {
              if (!value) return;
              setStatus(value);
              load({ page: 1, q, status: value, ownerScope });
            }}
            sx={{ ml: { xs: 0, md: 1 }, justifySelf: 'start', maxWidth: '100%', flexWrap: 'wrap' }}
          >
            <ToggleButton value="all">{t('temp_orders_status_all')}</ToggleButton>
            <ToggleButton value="draft">{t('temp_orders_status_draft')}</ToggleButton>
            <ToggleButton value="rework">{t('temp_orders_status_rework')}</ToggleButton>
            <ToggleButton value="sent">{t('temp_orders_status_sent')}</ToggleButton>
          </ToggleButtonGroup>
          {canViewAll && (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={ownerScope}
              aria-label={t('temp_orders_owner_filter')}
              onChange={(e, value) => {
                if (!value) return;
                setOwnerScope(value);
                load({ page: 1, q, status, ownerScope: value });
              }}
              sx={{ ml: { xs: 0, md: 1 }, justifySelf: 'start', maxWidth: '100%', flexWrap: 'wrap' }}
            >
              <ToggleButton value="mine">{t('temp_orders_scope_mine')}</ToggleButton>
              <ToggleButton value="all">{t('temp_orders_scope_all')}</ToggleButton>
            </ToggleButtonGroup>
          )}
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && !error && items.length === 0 && <Typography sx={{ opacity: 0.7 }}>{t('temp_purchase_orders_empty')}</Typography>}
        {!loading && !error && items.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map((item) => (
              <Card key={item.id} sx={{ borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', cursor: 'pointer', width: '100%', minWidth: 0 }} onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(item.id)}`, { state: { listState: { page: meta.page || 1, q, status, ownerScope } } })}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, minWidth: 0 }}>
                  <Box sx={{ flex: 1, minWidth: 0, pr: 2 }}>
                    <Typography variant="subtitle1" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{item.supplierName || item.supplierId || item.id}</Typography>
                    <Typography variant="caption" sx={{ color: getTempOrderStatusColor(item.status), fontWeight: 600 }}>{getTempOrderStatusLabel(t, item.status)}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>{item.bmsPurchaseOrderNumber || 'noch keine BMS-BE'} · {formatDateOnly(item.createdAt)}</Typography>
                    {(item.positions || []).map((position) => <Typography key={position.id} variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{`${position.article || '-'}; ${position.amount ?? '-'} ${position.unit || ''}; ${formatDateOnly(position.requestedDeliveryDate) || '-'}; EK ${position.purchasePrice ?? '-'}`}</Typography>)}
                  </Box>
                  <Box sx={{ width: 38, minWidth: 38, flex: '0 0 38px', display: 'flex', justifyContent: 'center' }}><ChevronRightIcon /></Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

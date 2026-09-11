import React from 'react';
import { Box, Card, CardContent, CircularProgress, IconButton, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Typography, Badge } from '@mui/material';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getPurchaseCartCount, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';

export default function TempPurchaseOrdersList() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = React.useState([]);
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [cartCount, setCartCount] = React.useState(() => getPurchaseCartCount());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest(`/temp-purchase-orders?page=1&pageSize=50&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
      setItems(Array.isArray(response?.data) ? response.data : []);
      setError('');
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
    }
  }, [q, status, t]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const sync = () => setCartCount(getPurchaseCartCount());
    window.addEventListener(PURCHASE_CART_CHANGED, sync);
    window.addEventListener('storage', sync);
    sync();
    return () => { window.removeEventListener(PURCHASE_CART_CHANGED, sync); window.removeEventListener('storage', sync); };
  }, []);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>{t('temp_purchase_orders_title')}</Typography>
        <IconButton color="primary" onClick={() => navigate('/purchase-cart')} aria-label={t('temp_purchase_cart_title')}>
          <Badge badgeContent={cartCount} color="error"><AddShoppingCartIcon /></Badge>
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <TextField size="small" fullWidth placeholder="Lieferant oder Material suchen" value={q} onChange={(e) => setQ(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ opacity: 0.6 }} /></InputAdornment> }} />
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(e, value) => value && setStatus(value)}>
          <ToggleButton value="all">Alle</ToggleButton>
          <ToggleButton value="draft">Entwurf</ToggleButton>
          <ToggleButton value="rework">Nacharbeit</ToggleButton>
          <ToggleButton value="sent">Gesendet</ToggleButton>
          <ToggleButton value="accepted">Übernommen</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {!loading && !items.length && <Typography sx={{ opacity: 0.7 }}>Keine Bestellungen vorhanden.</Typography>}
      {!loading && items.map((item) => (
        <Card key={item.id} variant="outlined" sx={{ mb: 1, cursor: 'pointer' }} onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(item.id)}`)}>
          <CardContent sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1">{item.supplierName || item.supplierId}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>Status {item.status} · {item.bmsPurchaseOrderNumber || 'noch keine BMS-BE'}</Typography>
              {(item.positions || []).map((position) => <Typography key={position.id} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{position.article} · {position.amount} {position.unit} · {position.requestedDeliveryDate || '-'}</Typography>)}
            </Box>
            <ChevronRightIcon />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

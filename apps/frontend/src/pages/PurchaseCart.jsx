import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import {
  getPurchaseCartItems,
  removePurchaseCartItem,
  clearPurchaseCart,
  updatePurchaseCartItem,
} from '../utils/purchaseCart.js';
import { nextWeekday } from '../utils/deliveryDate.js';

export default function PurchaseCart() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = React.useState(() => getPurchaseCartItems());
  const [locations, setLocations] = React.useState([]);
  const [loadingCustomerId, setLoadingCustomerId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [header, setHeader] = React.useState({
    supplierContact: items[0]?.supplierContact || '',
    paymentConditionText: items[0]?.paymentConditionText || '',
    paymentConditionId: items[0]?.paymentConditionId || '',
    deliveryTermText: items[0]?.deliveryTermText || '',
    packagingType: items[0]?.packagingType || '',
    comment: items[0]?.comment || '',
    loadingLocationId: items[0]?.loadingLocationId ?? '',
    loadingLocationText: items[0]?.loadingLocationText || '',
  });

  const supplier = items[0] || null;
  const dateSignature = items.map((item) => String(item.requestedDeliveryDate || '').slice(0, 10)).join('|');

  React.useEffect(() => {
    let alive = true;
    apiRequest('/purchase-order-loading-locations').then((response) => {
      if (!alive) return;
      const next = Array.isArray(response?.data) ? response.data : [];
      setLocations(next);
      setLoadingCustomerId(String(response?.meta?.ownCustomerId || '').trim());
      setHeader((previous) => {
        const preferred = next.find((item) => String(item.id) === String(previous.loadingLocationId)) || next[0];
        const hasCurrent = next.some((item) => String(item.id) === String(previous.loadingLocationId));
        return preferred && (!previous.loadingLocationId || !hasCurrent)
          ? { ...previous, loadingLocationId: preferred.id, loadingLocationText: preferred.text }
          : previous;
      });
      setLoading(false);
    }).catch((e) => {
      if (!alive) return;
      setError(e?.message || t('loading_error'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [t]);

  React.useEffect(() => {
    if (!items.length || !header.loadingLocationId) return undefined;
    const dates = [...new Set(items.map((item) => String(item.requestedDeliveryDate || '').slice(0, 10)).filter(Boolean))];
    if (!dates.length) return undefined;
    let alive = true;
    apiRequest('/delivery-calendar/check', {
      method: 'POST',
      body: JSON.stringify({ customerId: supplier?.loadingCustomerId || supplier?.ownCustomerId || loadingCustomerId, deliveryAddressId: header.loadingLocationId, dates }),
    }).then((response) => {
      if (!alive) return;
      const statuses = Array.isArray(response?.data) ? response.data : [];
      const statusByDate = new Map(statuses.map((status) => [String(status.date).slice(0, 10), status]));
      setItems((previous) => previous.map((item) => {
        const status = statusByDate.get(String(item.requestedDeliveryDate || '').slice(0, 10));
        if (!status || (!status.isWeekend && !status.isHoliday) || !status.suggestedDate) return item;
        updatePurchaseCartItem(item.lineId, { requestedDeliveryDate: status.suggestedDate });
        return { ...item, requestedDeliveryDate: status.suggestedDate };
      }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [header.loadingLocationId, dateSignature, loadingCustomerId, supplier?.loadingCustomerId]);

  const setLine = (lineId, patch) => {
    setItems((previous) => previous.map((item) => (
      String(item.lineId) === String(lineId) ? { ...item, ...patch } : item
    )));
    updatePurchaseCartItem(lineId, patch);
  };

  const setLocation = (event) => {
    const id = event.target.value;
    const option = locations.find((item) => String(item.id) === String(id));
    setHeader((previous) => ({ ...previous, loadingLocationId: id, loadingLocationText: option?.text || '' }));
  };

  const submit = async () => {
    if (!supplier || !items.length) return;
    if (!header.loadingLocationId) {
      setError('Bitte einen Ladeort des aktuellen Mandanten auswählen.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest('/temp-purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplier.supplierId,
          supplierContact: header.supplierContact,
          paymentConditionId: header.paymentConditionId || null,
          paymentConditionText: header.paymentConditionText,
          deliveryTermText: header.deliveryTermText,
          packagingType: header.packagingType,
          comment: header.comment,
          loadingLocationId: header.loadingLocationId,
          loadingLocationText: header.loadingLocationText,
          positions: items.map((item) => ({
            articleIndex: item.articleIndex,
            article: item.article,
            amount: Number(item.amount),
            unit: item.unit,
            purchasePrice: Number(item.purchasePrice),
            requestedDeliveryDate: item.requestedDeliveryDate,
            reservedFor: item.reservedFor,
            comment: item.comment,
            sourceBestellindex: item.sourceBestellindex,
            sourcePositionId: item.sourcePositionId,
            sourceOrderDate: item.sourceOrderDate,
          })),
        }),
      });
      clearPurchaseCart();
      setSuccess('Bestellentwurf wurde angelegt.');
      navigate(`/temp-purchase-orders/${encodeURIComponent(response?.data?.id)}`);
    } catch (e) {
      setError(e?.payload?.error?.suggestedDate
        ? `${e.message} Vorschlag: ${e.payload.error.suggestedDate}`
        : (e?.message || t('loading_error')));
    } finally {
      setSaving(false);
    }
  };

  if (!items.length) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>{t('temp_purchase_cart_title')}</Typography>
        <Typography sx={{ opacity: 0.7 }}>{t('purchase_cart_empty')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton onClick={() => navigate('/temp-purchase-orders')} aria-label="zurück"><ArrowBackIcon /></IconButton>
        <Typography variant="h5" sx={{ flex: 1 }}>{t('temp_purchase_cart_title')}</Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      <Card><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h6">{supplier?.supplierName || supplier?.supplierId}</Typography>
        <TextField label="Ansprechpartner" value={header.supplierContact} onChange={(e) => setHeader({ ...header, supplierContact: e.target.value })} fullWidth size="small" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
          <TextField label="Abweichende ZB" value={header.paymentConditionText} onChange={(e) => setHeader({ ...header, paymentConditionText: e.target.value })} size="small" />
          <TextField label="Lieferbedingungen" value={header.deliveryTermText} onChange={(e) => setHeader({ ...header, deliveryTermText: e.target.value })} size="small" />
          <TextField label="Ladeort" select value={header.loadingLocationId} onChange={setLocation} size="small" disabled={loading || !locations.length}>
            {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.text}</MenuItem>)}
          </TextField>
          <TextField label="Verpackung" value={header.packagingType} onChange={(e) => setHeader({ ...header, packagingType: e.target.value })} size="small" />
        </Box>
        <TextField label="Sonstiges" value={header.comment} onChange={(e) => setHeader({ ...header, comment: e.target.value })} multiline minRows={2} size="small" />
      </CardContent></Card>
      {items.map((item) => (
        <Card key={item.lineId} variant="outlined"><CardContent sx={{ display: 'grid', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>{item.article}</Typography>
            <IconButton size="small" onClick={() => { removePurchaseCartItem(item.lineId); setItems((previous) => previous.filter((entry) => entry.lineId !== item.lineId)); }} aria-label="entfernen"><DeleteOutlineIcon /></IconButton>
          </Box>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>Artikelindex: {item.articleIndex || '-'} · letzte BE: {item.sourceBestellindex || '-'}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1 }}>
            <TextField label="Menge" type="number" size="small" value={item.amount} onChange={(e) => setLine(item.lineId, { amount: e.target.value })} inputProps={{ min: 0.001, step: 0.001 }} />
            <TextField label="Einheit" size="small" value={item.unit || 'kg'} onChange={(e) => setLine(item.lineId, { unit: e.target.value })} />
            <TextField label="EK" type="number" size="small" value={item.purchasePrice} onChange={(e) => setLine(item.lineId, { purchasePrice: e.target.value })} inputProps={{ min: 0, step: 0.01 }} />
            <TextField label="Liefertermin" type="date" size="small" value={item.requestedDeliveryDate || nextWeekday()} onChange={(e) => setLine(item.lineId, { requestedDeliveryDate: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Box>
          <TextField label="Reserviert für" size="small" value={item.reservedFor || ''} onChange={(e) => setLine(item.lineId, { reservedFor: e.target.value })} />
        </CardContent></Card>
      ))}
      <Button variant="contained" onClick={submit} disabled={saving || loading || !locations.length}>
        {saving ? <CircularProgress size={20} /> : 'Bestellentwurf speichern'}
      </Button>
    </Box>
  );
}

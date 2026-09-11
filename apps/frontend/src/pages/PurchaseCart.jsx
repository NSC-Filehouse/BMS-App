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
  const missingFields = React.useMemo(() => {
    const missing = [];
    if (!String(header.loadingLocationId ?? '').trim() && !String(header.loadingLocationText || '').trim()) missing.push('Ladeort');
    items.forEach((item, index) => {
      if (!(Number(item.amount) > 0)) missing.push(`Menge Position ${index + 1}`);
      if (!(Number(item.purchasePrice) >= 0 && Number.isFinite(Number(item.purchasePrice)))) missing.push(`EK Position ${index + 1}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.requestedDeliveryDate || '').slice(0, 10))) missing.push(`Liefertermin Position ${index + 1}`);
    });
    return missing;
  }, [header.loadingLocationId, items]);
  const dateSignature = items.map((item) => String(item.requestedDeliveryDate || '').slice(0, 10)).join('|');

  React.useEffect(() => {
    let alive = true;
    const supplierId = String(supplier?.supplierId || '').trim();
    const preferredText = String(supplier?.loadingLocationText || '').trim();
    const query = supplierId
      ? `?supplierId=${encodeURIComponent(supplierId)}&preferredText=${encodeURIComponent(preferredText)}`
      : '';
    apiRequest(`/purchase-order-loading-locations${query}`).then((response) => {
      if (!alive) return;
      const next = Array.isArray(response?.data) ? response.data : [];
      setLocations(next);
      setLoadingCustomerId(String(response?.meta?.calendarCustomerId || response?.meta?.ownCustomerId || '').trim());
      setHeader((previous) => {
        const previousText = String(previous.loadingLocationText || '').trim().toLocaleLowerCase('de-DE');
        const preferred = next.find((item) => String(item.id) === String(previous.loadingLocationId))
          || next.find((item) => String(item.text || '').trim().toLocaleLowerCase('de-DE') === previousText)
          || next[0];
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
  }, [supplier?.loadingLocationText, supplier?.supplierId, t]);

  React.useEffect(() => {
    if (!items.length || !header.loadingLocationId || !loadingCustomerId || !/^\d+$/.test(String(header.loadingLocationId))) return undefined;
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
    if (missingFields.length) {
      setError(`Bitte Pflichtfelder ausfüllen: ${missingFields.join(', ')}.`);
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
      {!loading && !locations.length && (
        <Alert severity="warning">Für diesen Lieferanten wurde kein gespeicherter Ladeort gefunden. Bitte den Abholort unten manuell eintragen.</Alert>
      )}
      {!loading && missingFields.length > 0 && (
        <Alert severity="info">Pflichtfelder fehlen: {missingFields.join(', ')}.</Alert>
      )}
      <Card><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h6">{supplier?.supplierName || supplier?.supplierId}</Typography>
        <TextField label="Ansprechpartner" value={header.supplierContact} onChange={(e) => setHeader({ ...header, supplierContact: e.target.value })} fullWidth size="small" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
          <TextField label="Abweichende ZB" value={header.paymentConditionText} onChange={(e) => setHeader({ ...header, paymentConditionText: e.target.value })} size="small" />
          <TextField label="Lieferbedingungen" value={header.deliveryTermText} onChange={(e) => setHeader({ ...header, deliveryTermText: e.target.value })} size="small" />
          {locations.length ? (
            <TextField label="Ladeort" required select value={header.loadingLocationId} onChange={setLocation} size="small" disabled={loading} error={!loading && !header.loadingLocationId && !header.loadingLocationText} helperText={!loading && !header.loadingLocationId && !header.loadingLocationText ? 'Pflichtfeld' : ''}>
              {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.text}</MenuItem>)}
            </TextField>
          ) : (
            <TextField label="Ladeort" required value={header.loadingLocationText} onChange={(e) => setHeader((previous) => ({ ...previous, loadingLocationId: '', loadingLocationText: e.target.value }))} size="small" disabled={loading} error={!loading && !header.loadingLocationText} helperText={!loading ? 'Kein gespeicherter Ladeort – bitte Abholort eintragen' : ''} />
          )}
          <TextField label="Verpackung" value={header.packagingType} onChange={(e) => setHeader({ ...header, packagingType: e.target.value })} size="small" />
        </Box>
        <TextField label="Sonstiges" value={header.comment} onChange={(e) => setHeader({ ...header, comment: e.target.value })} multiline minRows={2} size="small" />
      </CardContent></Card>
      {items.map((item) => (
        <Card key={item.lineId} variant="outlined"><CardContent sx={{ display: 'grid', gap: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ flex: 1 }}>{item.article}</Typography>
            <IconButton color="error" size="small" onClick={() => { removePurchaseCartItem(item.lineId); setItems((previous) => previous.filter((entry) => entry.lineId !== item.lineId)); }} aria-label="entfernen"><DeleteOutlineIcon /></IconButton>
          </Box>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>Artikelindex: {item.articleIndex || '-'} · letzte BE: {item.sourceBestellindex || '-'}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1 }}>
            <TextField label="Menge" required type="number" size="small" value={item.amount} error={!(Number(item.amount) > 0)} helperText={!(Number(item.amount) > 0) ? 'Pflichtfeld' : ''} onChange={(e) => setLine(item.lineId, { amount: e.target.value })} inputProps={{ min: 0.001, step: 0.001 }} />
            <TextField label="Einheit" size="small" value={item.unit || 'kg'} onChange={(e) => setLine(item.lineId, { unit: e.target.value })} />
            <TextField label="EK" required type="number" size="small" value={item.purchasePrice} error={!(Number(item.purchasePrice) >= 0 && Number.isFinite(Number(item.purchasePrice)))} helperText={!(Number(item.purchasePrice) >= 0 && Number.isFinite(Number(item.purchasePrice))) ? 'Pflichtfeld' : ''} onChange={(e) => setLine(item.lineId, { purchasePrice: e.target.value })} inputProps={{ min: 0, step: 0.01 }} />
            <TextField label="Liefertermin" required type="date" size="small" value={item.requestedDeliveryDate || ''} error={!/^\d{4}-\d{2}-\d{2}$/.test(String(item.requestedDeliveryDate || '').slice(0, 10))} helperText={!/^\d{4}-\d{2}-\d{2}$/.test(String(item.requestedDeliveryDate || '').slice(0, 10)) ? 'Pflichtfeld' : ''} onChange={(e) => setLine(item.lineId, { requestedDeliveryDate: e.target.value })} InputLabelProps={{ shrink: true }} />
          </Box>
          <TextField label="Reserviert für" size="small" value={item.reservedFor || ''} onChange={(e) => setLine(item.lineId, { reservedFor: e.target.value })} />
        </CardContent></Card>
      ))}
      <Button variant="contained" onClick={submit} disabled={saving || loading || missingFields.length > 0}>
        {saving ? <CircularProgress size={20} /> : 'Bestellentwurf speichern'}
      </Button>
    </Box>
  );
}

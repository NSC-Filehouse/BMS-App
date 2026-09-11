import React from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';

export default function TempPurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState(null);
  const [locations, setLocations] = React.useState([]);
  const [loadingCustomerId, setLoadingCustomerId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const missingFields = React.useMemo(() => {
    if (!order) return [];
    const missing = [];
    if (!String(order.loadingLocationId ?? '').trim() && !String(order.loadingLocationText || '').trim()) missing.push('Ladeort');
    (order.positions || []).forEach((position, index) => {
      if (!(Number(position.amount) > 0)) missing.push(`Menge Position ${index + 1}`);
      if (!(Number(position.purchasePrice) >= 0 && Number.isFinite(Number(position.purchasePrice)))) missing.push(`EK Position ${index + 1}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(position.requestedDeliveryDate || '').slice(0, 10))) missing.push(`Liefertermin Position ${index + 1}`);
    });
    return missing;
  }, [order]);

  React.useEffect(() => {
    let alive = true;
    apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`).then(async (orderResponse) => {
      if (!alive) return;
      const nextOrder = orderResponse?.data || null;
      setOrder(nextOrder);
      const supplierId = String(nextOrder?.supplierId || '').trim();
      const preferredText = String(nextOrder?.loadingLocationText || '').trim();
      const query = supplierId
        ? `?supplierId=${encodeURIComponent(supplierId)}&preferredText=${encodeURIComponent(preferredText)}`
        : '';
      const locationResponse = await apiRequest(`/purchase-order-loading-locations${query}`);
      if (!alive) return;
      const nextLocations = Array.isArray(locationResponse?.data) ? locationResponse.data : [];
      setLocations(nextLocations);
      setOrder((previous) => {
        if (!previous) return previous;
        const currentId = String(previous.loadingLocationId ?? '').trim();
        const currentText = String(previous.loadingLocationText || '').trim().toLocaleLowerCase('de-DE');
        const selected = nextLocations.find((item) => String(item.id) === currentId)
          || nextLocations.find((item) => String(item.text || '').trim().toLocaleLowerCase('de-DE') === currentText);
        return selected && (!currentId || currentId !== String(selected.id))
          ? { ...previous, loadingLocationId: selected.id, loadingLocationText: selected.text }
          : previous;
      });
      setLoadingCustomerId(String(locationResponse?.meta?.calendarCustomerId || locationResponse?.meta?.ownCustomerId || '').trim());
    }).catch((e) => alive && setError(e?.message || 'Laden fehlgeschlagen.')).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  React.useEffect(() => {
    if (!order?.loadingLocationId || !loadingCustomerId || !Array.isArray(order?.positions) || !order.positions.length) return undefined;
    const dates = [...new Set(order.positions.map((position) => String(position.requestedDeliveryDate || '').slice(0, 10)).filter(Boolean))];
    if (!dates.length) return undefined;
    let alive = true;
    apiRequest('/delivery-calendar/check', {
      method: 'POST',
      body: JSON.stringify({ customerId: loadingCustomerId, deliveryAddressId: order.loadingLocationId, dates }),
    }).then((response) => {
      if (!alive) return;
      const statusByDate = new Map((Array.isArray(response?.data) ? response.data : []).map((status) => [String(status.date).slice(0, 10), status]));
      const replacements = new Map();
      order.positions.forEach((position) => {
        const status = statusByDate.get(String(position.requestedDeliveryDate || '').slice(0, 10));
        if (status?.suggestedDate && (status.isWeekend || status.isHoliday)) replacements.set(position.id, status.suggestedDate);
      });
      if (!replacements.size) return;
      setOrder((previous) => ({
        ...previous,
        positions: (previous.positions || []).map((position) => replacements.has(position.id)
          ? { ...position, requestedDeliveryDate: replacements.get(position.id) }
          : position),
      }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [loadingCustomerId, order?.loadingLocationId, order?.positions]);

  const patchOrder = (patch) => setOrder((previous) => ({ ...previous, ...(patch || {}) }));
  const patchPosition = (positionId, patch) => patchOrder({ positions: (order.positions || []).map((position) => position.id === positionId ? { ...position, ...(patch || {}) } : position) });

  const save = async () => {
    if (missingFields.length) {
      setError(`Bitte Pflichtfelder ausfüllen: ${missingFields.join(', ')}.`);
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          supplierId: order.supplierId,
          supplierContact: order.supplierContact,
          paymentConditionId: order.paymentConditionId,
          paymentConditionText: order.paymentConditionText,
          deliveryTermId: order.deliveryTermId,
          deliveryTermText: order.deliveryTermText,
          packagingType: order.packagingType,
          loadingLocationId: order.loadingLocationId,
          loadingLocationText: order.loadingLocationText,
          comment: order.comment,
          positions: order.positions,
        }),
      });
      navigate(`/temp-purchase-orders/${encodeURIComponent(response?.data?.id || id)}`);
    } catch (e) { setError(e?.payload?.error?.suggestedDate ? `${e.message} Vorschlag: ${e.payload.error.suggestedDate}` : (e?.message || 'Speichern fehlgeschlagen.')); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>;
  if (!order) return <Alert severity="error">{error || 'Bestellung nicht gefunden.'}</Alert>;
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}><IconButton onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(id)}`)}><ArrowBackIcon /></IconButton><Typography variant="h5">Bestellung bearbeiten</Typography></Box>
      {error && <Alert severity="error">{error}</Alert>}
      {missingFields.length > 0 && <Alert severity="info">Pflichtfelder fehlen: {missingFields.join(', ')}.</Alert>}
      <Card><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="h6">{order.supplierName}</Typography>
        <TextField label="Ansprechpartner" size="small" value={order.supplierContact || ''} onChange={(e) => patchOrder({ supplierContact: e.target.value })} />
        <TextField label="Abweichende ZB" size="small" value={order.paymentConditionText || ''} onChange={(e) => patchOrder({ paymentConditionText: e.target.value })} />
        <TextField label="Lieferbedingungen" size="small" value={order.deliveryTermText || ''} onChange={(e) => patchOrder({ deliveryTermText: e.target.value })} />
        {locations.length ? (
          <TextField label="Ladeort" required select size="small" value={order.loadingLocationId ?? ''} error={!loading && !order.loadingLocationId && !order.loadingLocationText} helperText={!order.loadingLocationId && !order.loadingLocationText ? 'Pflichtfeld' : ''} disabled={loading} onChange={(e) => { const option = locations.find((item) => String(item.id) === String(e.target.value)); patchOrder({ loadingLocationId: e.target.value, loadingLocationText: option?.text || '' }); }}>
            {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.text}</MenuItem>)}
          </TextField>
        ) : (
          <TextField label="Ladeort" required size="small" value={order.loadingLocationText || ''} error={!loading && !order.loadingLocationText} helperText="Kein gespeicherter Ladeort – bitte Abholort eintragen" disabled={loading} onChange={(e) => patchOrder({ loadingLocationId: '', loadingLocationText: e.target.value })} />
        )}
        <TextField label="Verpackung" size="small" value={order.packagingType || ''} onChange={(e) => patchOrder({ packagingType: e.target.value })} />
        <TextField label="Sonstiges" multiline minRows={2} size="small" value={order.comment || ''} onChange={(e) => patchOrder({ comment: e.target.value })} />
      </CardContent></Card>
      {(order.positions || []).map((position) => <Card key={position.id} variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography>{position.article}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4,1fr)' }, gap: 1 }}>
          <TextField label="Menge" type="number" size="small" value={position.amount} onChange={(e) => patchPosition(position.id, { amount: e.target.value })} />
          <TextField label="Einheit" size="small" value={position.unit} onChange={(e) => patchPosition(position.id, { unit: e.target.value })} />
          <TextField label="EK" type="number" size="small" value={position.purchasePrice} onChange={(e) => patchPosition(position.id, { purchasePrice: e.target.value })} />
          <TextField label="Liefertermin" type="date" size="small" value={position.requestedDeliveryDate || ''} onChange={(e) => patchPosition(position.id, { requestedDeliveryDate: e.target.value })} InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="Reserviert für" size="small" value={position.reservedFor || ''} onChange={(e) => patchPosition(position.id, { reservedFor: e.target.value })} />
      </CardContent></Card>)}
      <Button variant="contained" onClick={save} disabled={saving || missingFields.length > 0}>{saving ? <CircularProgress size={20} /> : 'Speichern'}</Button>
    </Box>
  );
}

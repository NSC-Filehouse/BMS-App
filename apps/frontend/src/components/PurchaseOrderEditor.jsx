import React from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PurchaseOrderSummary from './PurchaseOrderSummary.jsx';
import { apiRequest } from '../api/client.js';
import { packagingKey, purchaseMissingFields, createPurchaseLineId } from '../utils/purchaseCart.js';
import { useI18n } from '../utils/i18n.jsx';

const formatDate = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('.') : '–';
const priceText = (value) => value === null || value === undefined ? '–' : `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/t`;
const same = (a, b) => String(a || '').trim().toLocaleLowerCase('de-DE') === String(b || '').trim().toLocaleLowerCase('de-DE');

export default function PurchaseOrderEditor({ initialOrder, isNew = false, onChange, onSave, onContinue, saving, locked = false }) {
  const { lang } = useI18n();
  const [order, setOrder] = React.useState(initialOrder);
  const [options, setOptions] = React.useState({ packagingTypes: [], incoterms: [] });
  const [locations, setLocations] = React.useState([]);
  const [history, setHistory] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [locationsLoading, setLocationsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [locationError, setLocationError] = React.useState('');
  const locationSignature = JSON.stringify([...new Set(order.positions.map((p) => p.articleIndex).filter(Boolean))].sort());
  const update = React.useCallback((fn) => setOrder((previous) => typeof fn === 'function' ? fn(previous) : { ...previous, ...fn }), []);
  React.useEffect(() => { onChange?.(order); }, [order, onChange]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    apiRequest(`/purchase-order-options?supplierId=${encodeURIComponent(initialOrder.supplierId)}`).then((response) => {
      if (!alive) return;
      const data = response.data;
      setOptions(data);
      if (locked) return;
      update((previous) => {
        const original = [...new Set(previous.positions.map((p) => packagingKey(p.originalPackagingType)))];
        const packageValue = previous.packagingType || (original.length === 1 ? original[0] : '');
        const packaging = data.packagingTypes.find((p) => Number(previous.packagingTypeId) === p.id)
          || data.packagingTypes.find((p) => packageValue && p.aliases.some((alias) => packagingKey(alias) === packagingKey(packageValue)));
        const incoterm = data.incoterms.find((p) => Number(previous.deliveryTermId) === p.id)
          || data.incoterms.find((p) => same(p.text, previous.deliveryTermText || data.defaults.deliveryTermText));
        return { ...previous, supplierContact: previous.supplierContact ?? data.defaults.supplierContact,
          paymentConditionId: isNew ? data.defaults.paymentConditionId : previous.paymentConditionId,
          paymentConditionText: isNew ? data.defaults.paymentConditionText : previous.paymentConditionText,
          packagingTypeId: packaging?.id || '', packagingType: packaging?.text || '',
          deliveryTermId: incoterm?.id || '', deliveryTermText: incoterm?.text || '',
        };
      });
    }).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [initialOrder.supplierId, isNew, lang, locked, update]);

  React.useEffect(() => {
    let alive = true;
    const ids = JSON.parse(locationSignature);
    setLocationsLoading(true); setLocationError('');
    const query = new URLSearchParams({ supplierId: order.supplierId });
    ids.forEach((id) => query.append('articleIndex', id));
    apiRequest(`/purchase-order-loading-locations?${query}`).then((response) => {
      if (!alive) return;
      const next = response.data || [];
      setLocations(next);
      if (locked) return;
      update((previous) => {
        const selected = next.find((p) => same(p.text, previous.loadingLocationText)) || (isNew ? next[0] : null);
        return { ...previous, loadingLocationId: '', loadingLocationText: selected?.text || '' };
      });
    }).catch((e) => alive && setLocationError(e.message)).finally(() => alive && setLocationsLoading(false));
    const initialHistory = {};
    // The same latest-purchase record supplies both historical hints.
    Promise.all(ids.map(async (id) => {
      const response = await apiRequest(`/customers/${encodeURIComponent(order.supplierId)}/procured-articles/${encodeURIComponent(id)}/purchase-defaults`);
      initialHistory[id] = response.data.defaults;
    })).then(() => alive && setHistory(initialHistory)).catch((e) => alive && setLocationError(e.message));
    return () => { alive = false; };
  }, [isNew, locationSignature, order.supplierId, locked, update]);

  const patchPosition = (lineId, patch) => update((previous) => ({ ...previous, positions: previous.positions.map((p) => p.lineId === lineId ? { ...p, ...patch } : p) }));
  const missing = purchaseMissingFields(order);
  const disabled = saving || locked;
  const copy = (lineId) => update((previous) => {
    const positions = [...previous.positions];
    const index = positions.findIndex((p) => p.lineId === lineId);
    const source = positions[index];
    const { id, ...values } = source;
    positions.splice(index + 1, 0, { ...values, copyOfPositionId: id || source.copyOfPositionId, lineId: createPurchaseLineId(), amountTouched: true });
    return { ...previous, positions };
  });

  return <Box sx={{ display: 'grid', gap: 1.5 }}>
    {error && <Alert severity="error">{error}</Alert>}
    {locationError && <Alert severity="error">{locationError}</Alert>}
    {!locationsLoading && !locationError && !locations.length && order.positions.length > 0 && <Alert severity="warning">Für diese Artikel gibt es keinen gemeinsamen gespeicherten Ladeort. Bitte getrennte Bestellungen anlegen.</Alert>}
    {missing.length > 0 && <Alert severity="info">Pflichtfelder fehlen: {missing.join(', ')}.</Alert>}
    <Card><CardContent sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="h6">{order.supplierName || order.supplierId}</Typography>
      <TextField label="Ansprechpartner" size="small" value={order.supplierContact || ''} onChange={(e) => update({ supplierContact: e.target.value })} disabled={disabled || loading} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
        <TextField label="Zahlungsziel" size="small" value={order.paymentConditionText || ''} InputProps={{ readOnly: true }} />
        <TextField label="Incoterm" required select size="small" value={order.deliveryTermId || ''} disabled={disabled || loading} onChange={(e) => {
          const option = options.incoterms.find((p) => p.id === Number(e.target.value));
          update({ deliveryTermId: option?.id || '', deliveryTermText: option?.text || '' });
        }}><MenuItem value="" disabled>Bitte wählen</MenuItem>{options.incoterms.map((p) => <MenuItem key={p.id} value={p.id}>{p.text}</MenuItem>)}</TextField>
        <TextField label="Ladeort" required select size="small" value={order.loadingLocationText || ''} disabled={disabled || locationsLoading} onChange={(e) => update({ loadingLocationId: '', loadingLocationText: e.target.value })}>
          <MenuItem value="" disabled>Bitte wählen</MenuItem>{locations.map((p) => <MenuItem key={p.id} value={p.text}>{p.text}</MenuItem>)}
        </TextField>
        <TextField label="Verpackungsart" required select size="small" value={order.packagingTypeId || ''} disabled={disabled || loading} onChange={(e) => {
          const option = options.packagingTypes.find((p) => p.id === Number(e.target.value));
          update((previous) => ({ ...previous, packagingTypeId: option?.id || '', packagingType: option?.text || '',
            positions: previous.positions.map((p) => isNew && !p.amountTouched ? { ...p, amount: option?.key === 'silo' ? 25000 : 24750 } : p) }));
        }}><MenuItem value="" disabled>Bitte wählen</MenuItem>{options.packagingTypes.map((p) => <MenuItem key={p.id} value={p.id}>{p.text}</MenuItem>)}</TextField>
      </Box>
      <TextField label="Sonstiges" multiline minRows={2} size="small" value={order.comment || ''} onChange={(e) => update({ comment: e.target.value })} disabled={disabled} />
    </CardContent></Card>
    <PurchaseOrderSummary positions={order.positions} />
    {order.positions.map((p) => {
      const last = history[p.articleIndex] || p;
      return <Card key={p.lineId} variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>{p.article}</Typography>
          <IconButton size="small" aria-label="Position kopieren" disabled={disabled} onClick={() => copy(p.lineId)}><AddIcon /></IconButton>
          <IconButton size="small" color="error" aria-label="Position entfernen" disabled={disabled} onClick={() => update((previous) => ({ ...previous, positions: previous.positions.filter((position) => position.lineId !== p.lineId) }))}><DeleteOutlineIcon /></IconButton>
        </Box>
        <Typography variant="caption" color="text.secondary">Artikelindex: {p.articleIndex} · Ursprüngliche Verpackung: {p.originalPackagingType || '–'}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1, alignItems: 'end' }}>
          <TextField label="Menge (kg)" required type="number" size="small" value={p.amount} onChange={(e) => patchPosition(p.lineId, { amount: e.target.value, amountTouched: true })} disabled={disabled} inputProps={{ min: 0.001, step: 0.001 }} />
          <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Letzter EK: {priceText(last.lastPurchasePrice)}</Typography>
            <TextField fullWidth label="EK (€/t)" required type="number" size="small" value={p.purchasePrice ?? ''} onChange={(e) => patchPosition(p.lineId, { purchasePrice: e.target.value })} disabled={disabled} inputProps={{ min: 0, step: 0.01 }} /></Box>
          <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Letzter Liefertermin: {formatDate(last.lastDeliveryDate)}</Typography>
            <TextField fullWidth label="Liefertermin" required type="date" size="small" value={String(p.requestedDeliveryDate || '').slice(0, 10)} onChange={(e) => patchPosition(p.lineId, { requestedDeliveryDate: e.target.value })} disabled={disabled} InputLabelProps={{ shrink: true }} /></Box>
        </Box>
        <TextField label="Reserviert für" size="small" value={p.reservedFor || ''} onChange={(e) => patchPosition(p.lineId, { reservedFor: e.target.value })} disabled={disabled} />
        <TextField label="Positionshinweis" size="small" value={p.comment || ''} onChange={(e) => patchPosition(p.lineId, { comment: e.target.value })} disabled={disabled} />
      </CardContent></Card>;
    })}
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button variant="outlined" onClick={onContinue} disabled={saving || locked}>Weiter einkaufen</Button>
      <Button variant="contained" onClick={() => onSave(order)} disabled={saving || (!locked && (loading || locationsLoading || Boolean(error || locationError) || !locations.length || missing.length > 0))}>{saving ? <CircularProgress size={20} /> : locked ? 'Speichern erneut prüfen' : isNew ? 'Bestellentwurf speichern' : 'Speichern'}</Button>
    </Box>
  </Box>;
}

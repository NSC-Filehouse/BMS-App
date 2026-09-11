import React from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';

export default function TempPurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [working, setWorking] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`);
      setItem(response?.data || null);
    } catch (e) { setError(e?.message || 'Laden fehlgeschlagen.'); } finally { setLoading(false); }
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const finalize = async () => {
    setWorking(true); setError('');
    try { const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}/finalize`, { method: 'POST' }); setItem(response?.data || item); }
    catch (e) { setError(e?.message || 'Finalisierung fehlgeschlagen.'); }
    finally { setWorking(false); }
  };

  const remove = async () => {
    setWorking(true); setError('');
    try {
      await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/temp-purchase-orders');
    } catch (e) { setError(e?.message || 'Löschen fehlgeschlagen.'); }
    finally { setWorking(false); }
  };

  const handleBack = React.useCallback(() => {
    const listState = location.state?.listState;
    navigate('/temp-purchase-orders', listState ? { state: { listState } } : undefined);
  }, [location.state, navigate]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>;
  if (!item) return <Alert severity="error">{error || 'Bestellung nicht gefunden.'}</Alert>;
  const editable = item.status === 0 || item.status === 3;
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={handleBack}>Bestellungen</Button>
        <Typography variant="h5" sx={{ flex: 1 }}>Bestellung {item.id}</Typography>
        {editable && <Button startIcon={<EditIcon />} onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(id)}/edit`)}>Bearbeiten</Button>}
        {editable && <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={remove} disabled={working}>Löschen</Button>}
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Card><CardContent sx={{ display: 'grid', gap: 0.4 }}>
        <Typography variant="h6">{item.supplierName}</Typography>
        <Typography>Status: {item.status}</Typography>
        <Typography>Lieferant: {item.supplierId}</Typography>
        <Typography>Ansprechpartner: {item.supplierContact || '-'}</Typography>
        <Typography>Ladeort: {item.loadingLocationText || '-'}</Typography>
        <Typography>Verpackung: {item.packagingType || '-'}</Typography>
        <Typography>Lieferbedingungen: {item.deliveryTermText || '-'}</Typography>
        <Typography>Sonstiges: {item.comment || '-'}</Typography>
        <Typography>BMS-Bestellnummer: {item.bmsPurchaseOrderNumber || '-'}</Typography>
        <Typography>Einkaufsmail: {item.supplierMailStatus || 'nicht versendet'}</Typography>
        {item.supplierMailLastError && <Typography color="error">{item.supplierMailLastError}</Typography>}
      </CardContent></Card>
      {(item.positions || []).map((position) => <Card key={position.id} variant="outlined"><CardContent>
        <Typography variant="subtitle1">{position.article}</Typography>
        <Typography>{position.amount} {position.unit} · EK {position.purchasePrice} {position.currency}</Typography>
        <Typography>Liefertermin: {position.requestedDeliveryDate || '-'}</Typography>
        <Typography>Reserviert für: {position.reservedFor || '-'}</Typography>
        <Typography variant="caption">Vorherige BE: {position.sourceBestellindex || '-'}</Typography>
      </CardContent></Card>)}
      {editable && <Button variant="contained" onClick={finalize} disabled={working}>{working ? <CircularProgress size={20} /> : 'An CS senden'}</Button>}
    </Box>
  );
}

import React from 'react';
import { Alert, Box, CircularProgress, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { navigateToReturn } from '../utils/navigation.js';
import { supplierReturnTo } from '../utils/purchaseCart.js';
import PurchaseOrderEditor from '../components/PurchaseOrderEditor.jsx';
import { purchaseOrderListReturnTo } from '../utils/purchaseOrderDisplay.js';
import { isTempOrderEditableStatus } from '../utils/tempOrderStatus.js';

export default function TempPurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    setOrder(null);
    apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`).then((response) => {
      if (alive) setOrder({ ...response.data, positions: response.data.positions.map((p) => ({ ...p, originalPackagingType: p.originalPackagingType || response.data.packagingType, lineId: String(p.id), amountTouched: true })) });
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]);
  const save = async (values) => {
    setSaving(true); setError('');
    try {
      const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(values) });
      if (response?.data?.deleted) { navigateToReturn(navigate, purchaseOrderListReturnTo(location.state), '/temp-purchase-orders'); return; }
      navigate(`/temp-purchase-orders/${encodeURIComponent(id)}`, { replace: true, state: {
        returnTo: location.state?.afterSaveReturnTo || location.state?.returnTo,
        shoppingReturnTo: location.state?.shoppingReturnTo || supplierReturnTo(order.supplierId),
      } });
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigateToReturn(navigate, purchaseOrderListReturnTo(location.state), '/temp-purchase-orders');
    } catch (e) { setError(e.message || 'Löschen fehlgeschlagen.'); }
    finally { setSaving(false); }
  };
  const back = () => navigateToReturn(navigate, location.state?.returnTo, `/temp-purchase-orders/${encodeURIComponent(id)}`);
  if (!order) return error ? <Alert severity="error">{error}</Alert> : <CircularProgress />;
  return <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', display: 'grid', gap: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}><IconButton onClick={back} disabled={saving} aria-label="zurück"><ArrowBackIcon /></IconButton><Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>Bestellung bearbeiten</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    {isTempOrderEditableStatus(order.status)
      ? <PurchaseOrderEditor key={order.id} initialOrder={order} onSave={save} onDelete={remove} onContinue={() => navigateToReturn(navigate, location.state?.shoppingReturnTo || supplierReturnTo(order.supplierId), '/suppliers')} saving={saving} />
      : <Alert severity="info">Diese Bestellung ist nicht mehr bearbeitbar.</Alert>}
  </Box>;
}

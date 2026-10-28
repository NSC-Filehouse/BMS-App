import React from 'react';
import { Alert, Box, Button, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { navigateToReturn } from '../utils/navigation.js';
import PurchaseOrderEditor from '../components/PurchaseOrderEditor.jsx';
import { getPurchaseCartItems, getPurchaseCartContext, savePurchaseCartContext, replacePurchaseCartItems, clearPurchaseCart, getPurchaseRequestId, supplierReturnTo } from '../utils/purchaseCart.js';

export default function PurchaseCart() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialOrder] = React.useState(() => {
    const positions = getPurchaseCartItems();
    const context = getPurchaseCartContext();
    if (context.pendingPayload) return context.pendingPayload;
    return { comment: '', ...context.header, supplierId: positions[0]?.supplierId,
      supplierName: positions[0]?.supplierName, positions };
  });
  const [saving, setSaving] = React.useState(false);
  const [locked, setLocked] = React.useState(() => Boolean(getPurchaseCartContext().pendingPayload));
  const [error, setError] = React.useState('');
  const returnTo = getPurchaseCartContext().returnTo || location.state?.returnTo || supplierReturnTo(initialOrder.supplierId);
  const back = () => navigateToReturn(navigate, returnTo, '/suppliers');
  const change = React.useCallback((order) => {
    if (getPurchaseCartContext().pendingPayload) return;
    try {
      const { positions, ...header } = order;
      replacePurchaseCartItems(positions);
      savePurchaseCartContext({ header });
    } catch {
      setError('Die Eingaben konnten nicht im Browser gesichert werden. Bitte den Browserspeicher prüfen.');
    }
  }, []);
  const submit = async (order) => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const pending = getPurchaseCartContext().pendingPayload;
      const payload = pending || { ...order, clientRequestId: getPurchaseRequestId() };
      savePurchaseCartContext({ pendingPayload: payload });
      setLocked(true);
      const response = await apiRequest('/temp-purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
      const id = Number(response?.data?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Die Speicherantwort enthält keine gültige Bestellnummer. Bitte erneut prüfen.');
      clearPurchaseCart();
      navigate(`/temp-purchase-orders/${id}`, { replace: true, state: { returnTo, shoppingReturnTo: returnTo } });
    } catch (e) {
      if ([400, 422].includes(e.status)) { savePurchaseCartContext({ pendingPayload: null }); setLocked(false); }
      setError(e?.message || 'Speichern fehlgeschlagen. Bitte erneut prüfen.');
    } finally { setSaving(false); }
  };
  return <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', display: 'grid', gap: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><IconButton onClick={back} disabled={saving || locked} aria-label="zurück"><ArrowBackIcon /></IconButton><Typography variant="h5">Bestellwarenkorb</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    {locked && <Alert severity="info">Der Speicherstatus wird mit derselben Anfrage geprüft. Bitte „Speichern erneut prüfen“ verwenden.</Alert>}
    {initialOrder.positions.length ? <PurchaseOrderEditor initialOrder={initialOrder} isNew onChange={change} onSave={submit} onContinue={back} saving={saving} locked={locked} />
      : <><Typography>Der Bestellwarenkorb ist leer.</Typography><Button onClick={back}>Weiter einkaufen</Button></>}
  </Box>;
}

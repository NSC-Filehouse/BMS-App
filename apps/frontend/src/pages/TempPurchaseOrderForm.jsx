import React from 'react';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { Alert, Box, CircularProgress, IconButton, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { navigateToReturn } from '../utils/navigation.js';
import { supplierReturnTo } from '../utils/purchaseCart.js';
import { useFeatureAccess } from '../components/FeatureAccess.jsx';
import { PurchaseOptionArticleNames } from '../components/PurchaseOrderSummary.jsx';
import PurchaseOrderEditor from '../components/PurchaseOrderEditor.jsx';
import { purchaseOrderListReturnTo } from '../utils/purchaseOrderDisplay.js';
import { isTempOrderEditableStatus } from '../utils/tempOrderStatus.js';
import { useI18n } from '../utils/i18n.jsx';
import { purchaseOrderRequestBody } from '../utils/purchaseOrderAttachments.js';

export default function TempPurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { features } = useFeatureAccess();
  const attachmentInputRef = React.useRef(null);
  const [order, setOrder] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let alive = true;
    setOrder(null);
    apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`).then((response) => {
      if (!alive) return;
      if (response.data.readOnly) {
        navigate(`/temp-purchase-orders/${encodeURIComponent(id)}`, { replace: true, state: location.state });
        return;
      }
      setOrder({ ...response.data, positions: response.data.positions.map((p) => ({ ...p, originalPackagingType: p.originalPackagingType || response.data.packagingType, lineId: String(p.id), amountTouched: true })) });
    }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, location.state, navigate]);
  const save = async (values) => {
    setSaving(true); setError('');
    try {
      const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: purchaseOrderRequestBody(values) });
      if (response?.data?.deleted) { navigateToReturn(navigate, purchaseOrderListReturnTo(location.state), '/temp-purchase-orders'); return; }
      navigate(`/temp-purchase-orders/${encodeURIComponent(id)}`, { replace: true, state: {
        returnTo: location.state?.afterSaveReturnTo || location.state?.returnTo,
        shoppingReturnTo: location.state?.shoppingReturnTo || supplierReturnTo(order.supplierId),
      } });
    } catch (e) { setError(e.message); return e; } finally { setSaving(false); }
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}><DisclosureBackButton onClick={back} disabled={saving} aria-label="zurück"><ArrowBackIcon /></DisclosureBackButton><Typography variant="h5" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{order.positions.some(p=>p.optionId!=null)?'Bestellung (Option) bearbeiten':'Bestellung bearbeiten'}</Typography>
      <IconButton aria-label={t('temp_order_attachment_add')} title={t('temp_order_attachment_add')} disabled={saving || !isTempOrderEditableStatus(order.status)} onClick={() => attachmentInputRef.current?.click()}><AttachFileIcon /></IconButton>
    </Box>
    <PurchaseOptionArticleNames positions={order.positions} />
    {error && <Alert severity="error">{error}</Alert>}
    {isTempOrderEditableStatus(order.status)
      ? <PurchaseOrderEditor key={order.id} initialOrder={order} attachmentInputRef={attachmentInputRef} onSave={save} allowFirstPurchase={features.linkedProcurement} linkedOrder={Boolean(order.linkedOrderIds?.length)} onDelete={order.linkedOrderIds?.length ? undefined : remove} onContinue={() => navigateToReturn(navigate, location.state?.shoppingReturnTo || supplierReturnTo(order.supplierId), '/suppliers')} saving={saving} />
      : <Alert severity="info">Diese Bestellung ist nicht mehr bearbeitbar.</Alert>}
  </Box>;
}

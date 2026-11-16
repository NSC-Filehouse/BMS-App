import React from 'react';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { Alert, Box, Button, IconButton, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { navigateToReturn } from '../utils/navigation.js';
import PurchaseOrderEditor from '../components/PurchaseOrderEditor.jsx';
import { useI18n } from '../utils/i18n.jsx';
import { purchaseOrderRequestBody } from '../utils/purchaseOrderAttachments.js';
import { getPurchaseCartAttachmentFiles, savePurchaseCartAttachmentFiles, getPurchaseCartItems, getPurchaseCartContext, savePurchaseCartContext, replacePurchaseCartItems, clearPurchaseCart, getPurchaseRequestId, resolvePurchaseCartReturnTo } from '../utils/purchaseCart.js';

export default function PurchaseCart() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const attachmentInputRef = React.useRef(null);
  const [initialOrder] = React.useState(() => {
    const positions = getPurchaseCartItems();
    const context = getPurchaseCartContext();
    if (context.pendingPayload) return { ...context.pendingPayload, pendingAttachmentFiles: getPurchaseCartAttachmentFiles(), hadPendingAttachments: context.pendingPayload.attachmentCount > 0 };
    return { comment: '', ...context.header, supplierId: positions[0]?.supplierId,
      supplierName: positions[0]?.supplierName, positions, pendingAttachmentFiles: getPurchaseCartAttachmentFiles() };
  });
  const [saving, setSaving] = React.useState(false);
  const [locked, setLocked] = React.useState(() => Boolean(getPurchaseCartContext().pendingPayload));
  const [error, setError] = React.useState('');
  const returnTo = resolvePurchaseCartReturnTo(location.state,getPurchaseCartContext(),initialOrder.supplierId);
  const back = () => navigateToReturn(navigate, returnTo, '/suppliers');
  const removeDraft = () => { if (!saving && !locked) { clearPurchaseCart(); back(); } };
  const change = React.useCallback((order) => {
    if (getPurchaseCartContext().pendingPayload) return;
    try {
      const { positions, pendingAttachmentFiles = [], attachments, ...header } = order;
      savePurchaseCartAttachmentFiles(pendingAttachmentFiles);
      replacePurchaseCartItems(positions);
      savePurchaseCartContext({ header: { ...header, hadPendingAttachments: header.hadPendingAttachments || pendingAttachmentFiles.length > 0 } });
    } catch {
      setError('Die Eingaben konnten nicht im Browser gesichert werden. Bitte den Browserspeicher prüfen.');
    }
  }, []);
  const submit = async (order) => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const pending = getPurchaseCartContext().pendingPayload;
      const { pendingAttachmentFiles = [], attachments, hadPendingAttachments, ...values } = order;
      const payload = pending || { ...values, attachmentCount: pendingAttachmentFiles.length, clientRequestId: getPurchaseRequestId() };
      savePurchaseCartContext({ pendingPayload: payload });
      setLocked(true);
      const response = await apiRequest('/temp-purchase-orders', { method: 'POST', body: purchaseOrderRequestBody(payload, pendingAttachmentFiles) });
      const id = Number(response?.data?.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error('Die Speicherantwort enthält keine gültige Bestellnummer. Bitte erneut prüfen.');
      clearPurchaseCart();
      navigate(`/temp-purchase-orders/${id}`, { replace: true, state: { returnTo, shoppingReturnTo: returnTo } });
    } catch (e) {
      if ([400, 413, 422].includes(e.status)) { savePurchaseCartContext({ pendingPayload: null }); setLocked(false); }
      setError(e?.message || 'Speichern fehlgeschlagen. Bitte erneut prüfen.');
    } finally { setSaving(false); }
  };
  return <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, display: 'grid', gap: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}><DisclosureBackButton onClick={back} disabled={saving || locked} aria-label="zurück"><ArrowBackIcon /></DisclosureBackButton><Typography variant="h5" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{initialOrder.positions.some(p=>p.optionId!=null)?'Bestellung (Option)':'Bestellwarenkorb'}</Typography>
      <IconButton aria-label={t('temp_order_attachment_add')} title={t('temp_order_attachment_add')} disabled={saving || locked || !initialOrder.positions.length} onClick={() => attachmentInputRef.current?.click()}><AttachFileIcon /></IconButton>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {locked && <Alert severity="info">Der Speicherstatus wird mit derselben Anfrage geprüft. Bitte „Speichern erneut prüfen“ verwenden.</Alert>}
    {initialOrder.positions.length ? <PurchaseOrderEditor initialOrder={initialOrder} attachmentInputRef={attachmentInputRef} isNew onChange={change} onSave={submit} onContinue={back} onDelete={removeDraft} saving={saving} locked={locked} />
      : <><Typography>Der Bestellwarenkorb ist leer.</Typography><Button onClick={back}>Weiter einkaufen</Button></>}
  </Box>;
}

import React from 'react';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest, apiRequestBlob } from '../api/client.js';
import PurchaseOrderSummary from '../components/PurchaseOrderSummary.jsx';
import PurchaseOrderActions from '../components/PurchaseOrderActions.jsx';
import InfoRow from '../components/PurchaseOrderInfoRow.jsx';
import { supplierReturnTo } from '../utils/purchaseCart.js';
import { createReturnTo, navigateToReturn } from '../utils/navigation.js';
import { formatPurchaseDate, formatPurchaseNumber, formatPurchasePrice, purchaseOrderListReturnTo } from '../utils/purchaseOrderDisplay.js';
import { getTempOrderStatusColor, getTempOrderStatusLabel, isTempOrderEditableStatus } from '../utils/tempOrderStatus.js';
import { useI18n } from '../utils/i18n.jsx';

export default function TempPurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [attachmentDownloading, setAttachmentDownloading] = React.useState('');
  const downloadAttachment = async (attachment) => {
    setAttachmentDownloading(String(attachment.id)); setError('');
    try {
      const blob = await apiRequestBlob(`/temp-purchase-orders/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment.id)}`);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = String(attachment.fileName || `purchase-order-${id}-attachment`).replace(/[\\/\r\n]/g, '_');
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) { setError(e?.message || t('loading_error')); }
    finally { setAttachmentDownloading(''); }
  };
  React.useEffect(() => {
    let alive = true;
    setLoading(true); setItem(null); setError('');
    apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`).then((response) => alive && setItem(response.data))
      .catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);
  const finalize = async () => {
    if (working) return;
    setWorking(true); setError('');
    try { const response = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}/finalize`, { method: 'POST' }); setItem((previous) => ({ ...response.data, linkedOrderIds: previous?.linkedOrderIds })); }
    catch (e) { setError(e.message || 'Senden fehlgeschlagen.'); }
    finally { setWorking(false); }
  };
  const remove = async () => {
    if (working) return;
    setWorking(true); setError('');
    try {
      await apiRequest(`/temp-purchase-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigateToReturn(navigate, purchaseOrderListReturnTo(location.state), '/temp-purchase-orders');
    } catch (e) { setError(e.message || 'Löschen fehlgeschlagen.'); }
    finally { setWorking(false); }
  };
  const back = () => navigateToReturn(navigate, location.state?.returnTo, '/temp-purchase-orders', location.state?.listState ? { listState: location.state.listState } : null);
  const editable = item && isTempOrderEditableStatus(item.status);
  return <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
      <DisclosureBackButton aria-label="Zurück" onClick={back} disabled={working}><ArrowBackIcon /></DisclosureBackButton>
      <Box sx={{ minWidth: 0 }}>
        {item?.bmsPurchaseOrderNumber && <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', overflowWrap: 'anywhere' }}>BE: {item.bmsPurchaseOrderNumber}</Typography>}
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item?.supplierName || `Bestellung ${id}`}</Typography>
      </Box>
    </Box>
    {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!loading && item && <Card sx={{ width: '100%', minWidth: 0 }}><CardContent sx={{ pt: 2, minWidth: 0 }}>
      {item.linkedOrderIds?.length ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mb: 1 }}>
          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 700 }}>
            {t('procurement_purchase_for_order')}
          </Typography>
          {item.linkedOrderIds.map((orderId) => <Button key={orderId} size="small"
            onClick={() => navigate('/temp-orders/' + orderId, { state: { returnTo: createReturnTo(location) } })}>
            {t('procurement_order_link', { id: orderId })}
          </Button>)}
        </Box>
      ) : (
        <Typography variant="h6">{item.positions.some((p) => p.optionId != null) ? 'Bestellung (Option)' : 'Bestellung'}</Typography>
      )}
      <InfoRow label="Lieferant" value={item.supplierName} />
      <InfoRow label="Lieferantennummer" value={item.supplierId} />
      <InfoRow label="Anschrift" value={item.supplierAddress} />
      <InfoRow label="Ansprechpartner" value={item.supplierContact} />
      <InfoRow label="Status" value={<Box component="span" sx={{ color: getTempOrderStatusColor(item.status), fontWeight: 600 }}>{getTempOrderStatusLabel(t, item.status)}</Box>} />
      <InfoRow label="Erstellt am" value={formatPurchaseDate(item.createdAt)} />
      <InfoRow label="Erstellt von" value={item.createdBy} />
      {item.closingDate && <InfoRow label="An BMS gesendet am" value={formatPurchaseDate(item.closingDate)} />}
      {item.completedBy && <InfoRow label="An BMS gesendet von" value={item.completedBy} />}
      {item.returnComment && <InfoRow label="Nacharbeit" value={item.returnComment} />}
      <InfoRow label="Zahlungsziel" value={item.paymentConditionText} />
      <InfoRow label="Incoterm" value={item.deliveryTermText} />
      <InfoRow label="Ladeort" value={item.loadingLocationText} />
      <InfoRow label="Verpackungsart" value={item.packagingType} />
      <InfoRow label="Sonstiges" value={item.comment} />
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 0.25 }}>{t('temp_order_attachment_label')} ({item.attachments?.length || 0})</Typography>
      {item.attachments?.length ? <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
        {item.attachments.map((attachment) => <Box key={attachment.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, overflowWrap: 'anywhere' }}><AttachFileIcon fontSize="small" />{attachment.fileName}</Typography>
          <Button size="small" startIcon={<DownloadIcon />} disabled={attachmentDownloading === String(attachment.id)} onClick={() => downloadAttachment(attachment)}>{t('temp_order_attachment_download')}</Button>
        </Box>)}
      </Box> : <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('temp_order_attachment_none')}</Typography>}
      <PurchaseOrderSummary positions={item.positions} />
      <Box sx={{ display: 'grid', gap: 1, mt: 1.25, minWidth: 0 }}>
        {(item.positions || []).map((p, index) => <Box key={p.id} sx={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 1.5, p: 1.25, display: 'grid', gap: 0.35, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{index + 1}. {p.article || '–'}</Typography>
          {p.masterArticleName && p.masterArticleName !== p.article && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Unsere Bezeichnung: {p.masterArticleName}</Typography>}
          {p.optionId!=null && <Typography variant="caption" color="primary">Bestellung (Option)</Typography>}
          <Typography variant="caption" color="text.secondary">Artikelindex: {p.articleIndex || '–'}</Typography>
          <Typography variant="caption" color="text.secondary">Liefertermin: {formatPurchaseDate(p.requestedDeliveryDate)}</Typography>
          <Typography variant="caption" color="text.secondary">Menge: {formatPurchaseNumber(p.amount)} kg · EK: {formatPurchasePrice(p.purchasePrice, p.currency)}</Typography>
          <Typography variant="caption" color="text.secondary">Ursprüngliche Verpackung: {p.originalPackagingType || item.packagingType || '–'}<br />Verpackung geändert: {p.packagingTypeChanged ? 'Ja' : 'Nein'}</Typography>
          {p.reservedFor && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>Reserviert für: {p.reservedFor}</Typography>}
          {p.comment && <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>Positionshinweis: {p.comment}</Typography>}
        </Box>)}
      </Box>
      <PurchaseOrderActions>
        {editable && <Button variant="contained" onClick={finalize} disabled={working}>An BMS senden</Button>}
        {editable && <Button variant="outlined" disabled={working} onClick={() => navigate(`/temp-purchase-orders/${encodeURIComponent(id)}/edit`, { state: {
          returnTo: createReturnTo(location), afterSaveReturnTo: location.state?.returnTo || null,
          shoppingReturnTo: location.state?.shoppingReturnTo || supplierReturnTo(item.supplierId),
        } })}>Bearbeiten</Button>}
        <Button variant="outlined" disabled={working} onClick={() => navigateToReturn(navigate, location.state?.shoppingReturnTo || supplierReturnTo(item.supplierId), '/suppliers')}>Weiter einkaufen</Button>
        {editable && !item.linkedOrderIds?.length && <Button variant="outlined" color="error" onClick={remove} disabled={working}>Löschen</Button>}
      </PurchaseOrderActions>
    </CardContent></Card>}
  </Box>;
}

import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import {
  TEMP_ORDER_STATUS,
  getTempOrderStatusColor,
  getTempOrderStatusLabel,
  isTempOrderEditableStatus,
  isTempOrderFinalizedStatus,
  normalizeTempOrderStatus,
} from '../utils/tempOrderStatus.js';

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE');
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return String(value);
}

function InfoRow({ label, value }) {
  return (
    <Box
      sx={{
        display: { xs: 'grid', md: 'flex' },
        gridTemplateColumns: 'minmax(0, 1fr)',
        alignItems: { xs: 'start', md: 'center' },
        justifyContent: 'space-between',
        gap: { xs: 0.25, md: 2 },
        py: 0.75,
        minWidth: 0,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          width: { xs: '100%', md: '60%' },
          maxWidth: { xs: '100%', md: '60%' },
          minWidth: 0,
          textAlign: { xs: 'left', md: 'right' },
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function TempOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [finalizeOpen, setFinalizeOpen] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);

  const orderStatus = normalizeTempOrderStatus(item?.orderStatus, item?.completed);
  const orderIsEditable = item ? isTempOrderEditableStatus(orderStatus, item.completed) : false;
  const orderIsFinalized = item ? isTempOrderFinalizedStatus(orderStatus, item.completed) : false;

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/temp-orders/${encodeURIComponent(id)}`);
      setItem(res?.data || null);
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleBack = React.useCallback(() => {
    const fromTempOrders = location.state?.fromTempOrders;
    if (fromTempOrders) {
      navigate('/temp-orders', { state: { listState: fromTempOrders } });
      return;
    }
    navigate('/temp-orders');
  }, [location.state, navigate]);

  const deleteOrder = async () => {
    try {
      setError('');
      await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/temp-orders');
    } catch (e) {
      setError(e?.message || t('loading_error'));
    }
  };

  const finalizeOrder = async () => {
    try {
      setFinalizing(true);
      setError('');
      const res = await apiRequest(`/temp-orders/${encodeURIComponent(id)}/finalize`, { method: 'POST' });
      setItem(res?.data || null);
      setFinalizeOpen(false);
    } catch (e) {
      setFinalizeOpen(false);
      setError(e?.message || t('loading_error'));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={handleBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {item?.clientName || id}
        </Typography>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && item && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ pt: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, max-content)' },
                gap: 1,
                mb: 2,
                minWidth: 0,
              }}
            >
              {orderIsEditable && (
                <Button variant="contained" sx={{ minWidth: 0, width: '100%', whiteSpace: 'nowrap' }} onClick={() => setFinalizeOpen(true)}>
                  {t('temp_order_send_cs')}
                </Button>
              )}
              {orderIsEditable && (
                <Button
                  variant="outlined"
                  sx={{ minWidth: 0, width: '100%', whiteSpace: 'nowrap' }}
                  onClick={() => navigate(`/temp-orders/${encodeURIComponent(id)}/edit`)}
                >
                  {t('edit_label')}
                </Button>
              )}
              <Button
                variant="outlined"
                sx={{ minWidth: 0, width: '100%', whiteSpace: 'nowrap' }}
                onClick={() => navigate('/temp-orders/new', {
                  state: {
                    copyOrder: {
                      clientReferenceId: item.clientReferenceId || '',
                      clientName: item.clientName || '',
                      clientAddress: item.clientAddress || '',
                      clientRepresentative: item.clientRepresentative || '',
                      comment: item.comment || '',
                      specialPaymentCondition: Boolean(item.specialPaymentCondition),
                      specialPaymentText: item.specialPaymentText || '',
                      specialPaymentId: item.specialPaymentId ?? '',
                      deliveryTypeId: item.deliveryTypeId ?? '',
                      deliveryType: item.deliveryType || '',
                      packagingType: item.packagingType || '',
                      deliveryDate: item.deliveryDate || '',
                      deliveryAddress: item.deliveryAddress || '',
                      deliveryAddressChanged: Boolean(item.deliveryAddressChanged),
                      positions: Array.isArray(item.positions) ? item.positions : [],
                    },
                  },
                })}
              >
                {t('copy_label')}
              </Button>
              {orderIsEditable && (
                <Button variant="outlined" color="error" sx={{ minWidth: 0, width: '100%', whiteSpace: 'nowrap' }} onClick={deleteOrder}>
                  {t('delete_label')}
                </Button>
              )}
            </Box>

            <InfoRow label={t('order_customer')} value={item.clientName} />
            <InfoRow label={t('address_label')} value={item.clientAddress} />
            <InfoRow label={t('contact_label')} value={item.clientRepresentative} />
            <InfoRow label={t('order_passed_to')} value={item.passedTo} />
            <InfoRow label={t('order_received_from')} value={item.receivedFrom} />
            <InfoRow label={t('order_completed')} value={orderIsFinalized ? t('yes_label') : t('no_label')} />
            <Box sx={{ py: 0.75 }}>
              <InfoRow
                label={t('temp_order_status')}
                value={getTempOrderStatusLabel(t, orderStatus, item.completed)}
              />
              {orderStatus === TEMP_ORDER_STATUS.NEEDS_REWORK && (
                <Typography variant="caption" sx={{ color: getTempOrderStatusColor(orderStatus), display: 'block', mt: -0.25 }}>
                  {t('temp_order_status_rework_hint')}
                </Typography>
              )}
            </Box>
            {orderIsFinalized && <InfoRow label={t('temp_order_sent_at')} value={formatDateTime(item.closingDate)} />}
            {orderIsFinalized && <InfoRow label={t('temp_order_sent_by')} value={item.completedBy} />}
            {item.mail && <InfoRow label={t('temp_order_mail_status')} value={t(`temp_order_mail_${item.mail.status || 'pending'}`)} />}
            {item.mail?.recipient && <InfoRow label={t('temp_order_mail_recipient')} value={item.mail.recipient} />}
            <InfoRow label={t('order_confirmed')} value={item.isConfirmed ? t('yes_label') : t('no_label')} />
            <InfoRow label={t('order_created')} value={formatDateOnly(item.createdAt)} />
            <InfoRow label={t('order_comment')} value={item.comment} />
            <InfoRow label={t('incoterm_label')} value={item.deliveryType || '-'} />
            <InfoRow label={t('packaging_type_label')} value={item.packagingType || '-'} />
            <InfoRow label={t('delivery_address_label')} value={item.deliveryAddress || '-'} />
            <InfoRow label={t('special_payment_condition')} value={item.specialPaymentCondition ? t('yes_label') : t('no_label')} />
            <InfoRow
              label={t('special_payment_text_label')}
              value={item.specialPaymentText ? `${item.specialPaymentText}${item.specialPaymentId ? ` (#${item.specialPaymentId})` : ''}` : '-'}
            />
            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
              {t('order_positions_count')}: {Array.isArray(item.positions) ? item.positions.length : 0}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(Array.isArray(item.positions) ? item.positions : []).map((pos, idx) => (
                <Box
                  key={`${pos.id || pos.beNumber || idx}-${idx}`}
                  sx={{
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 1.5,
                    p: 1.25,
                    display: 'grid',
                    gap: 0.35,
                    minWidth: 0,
                  }}
                >
                  <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {pos.article || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t('product_be_number')}: {pos.beNumber || '-'} | {t('product_warehouse')}: {pos.warehouse || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t('delivery_date')}: {formatDateOnly(pos.deliveryDate) || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t('product_amount')}: {pos.amountInKg ?? '-'} kg | {t('order_sale_price')}: {formatPrice(pos.price)} | {t('product_price')}: {formatPrice(pos.costPrice)}
                  </Typography>
                  <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {t('order_reserve_amount')}: {pos.reservationInKg ?? '-'} kg | {t('order_reserved_until')}: {formatDateOnly(pos.reservationDate)}
                  </Typography>
                  {(pos.wpzId || pos.wpzComment) && (
                    <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {t('wpz_label')}: {pos.wpzId ? `#${pos.wpzId}` : t('wpz_not_available')}
                      {pos.wpzId ? ` | ${t('wpz_original_use')}: ${pos.wpzOriginal ? t('yes_label') : t('no_label')}` : ''}
                      {` | ${t('wpz_comment_label')}: ${pos.wpzComment || '-'}`}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Dialog open={finalizeOpen} onClose={() => (!finalizing ? setFinalizeOpen(false) : undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{t('temp_order_send_bms')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('temp_order_send_bms_confirm')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinalizeOpen(false)} disabled={finalizing}>{t('back_label')}</Button>
          <Button variant="contained" onClick={finalizeOrder} disabled={finalizing}>
            {finalizing ? t('temp_order_sending_bms') : t('temp_order_send_bms')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

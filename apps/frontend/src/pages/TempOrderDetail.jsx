import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE');
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
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ maxWidth: '60%', textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={handleBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">{item?.clientName || id}</Typography>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && item && (
        <Card>
          <CardContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button variant="outlined" onClick={() => navigate(`/temp-orders/${encodeURIComponent(id)}/edit`)}>{t('edit_label')}</Button>
              <Button variant="outlined" color="error" onClick={deleteOrder}>{t('delete_label')}</Button>
            </Box>

            <InfoRow label={t('order_customer')} value={item.clientName} />
            <InfoRow label={t('address_label')} value={item.clientAddress} />
            <InfoRow label={t('contact_label')} value={item.clientRepresentative} />
            <InfoRow label={t('order_passed_to')} value={item.passedTo} />
            <InfoRow label={t('order_received_from')} value={item.receivedFrom} />
            <InfoRow label={t('order_completed')} value={item.completed ? t('yes_label') : t('no_label')} />
            <InfoRow label={t('order_confirmed')} value={item.isConfirmed ? t('yes_label') : t('no_label')} />
            <InfoRow label={t('order_created')} value={formatDateOnly(item.createdAt)} />
            <InfoRow label={t('order_comment')} value={item.comment} />
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
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {pos.article || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('product_be_number')}: {pos.beNumber || '-'} | {t('product_warehouse')}: {pos.warehouse || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('product_amount')}: {pos.amountInKg ?? '-'} kg | {t('order_sale_price')}: {formatPrice(pos.price)} | {t('product_price')}: {formatPrice(pos.costPrice)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('order_reserve_amount')}: {pos.reservationInKg ?? '-'} kg | {t('order_reserved_until')}: {formatDateOnly(pos.reservationDate)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('delivery_date')}: {formatDateOnly(pos.deliveryDate)} | {t('delivery_address_label')}: {pos.deliveryAddress || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('incoterm_label')}: {pos.deliveryType || '-'} | {t('packaging_type_label')}: {pos.packagingType || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.75 }}>
                    {t('special_payment_condition')}: {pos.specialPaymentCondition ? t('yes_label') : t('no_label')}
                    {pos.specialPaymentCondition
                      ? ` | ${t('special_payment_text_label')}: ${pos.specialPaymentText ? `${pos.specialPaymentText}${pos.specialPaymentId ? ` (#${pos.specialPaymentId})` : ''}` : '-'}`
                      : ''}
                  </Typography>
                  {(pos.wpzId || pos.wpzComment) && (
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>
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
    </Box>
  );
}

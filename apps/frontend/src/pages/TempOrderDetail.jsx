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
    navigate(-1);
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
        <Typography variant="h5">{item?.beNumber || id}</Typography>
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

            <InfoRow label={t('product_be_number')} value={item.beNumber} />
            <InfoRow label={t('product_article')} value={item.article} />
            <InfoRow label={t('product_warehouse')} value={item.warehouse} />
            <InfoRow label={t('product_amount')} value={item.amountInKg !== null && item.amountInKg !== undefined ? `${item.amountInKg} kg` : ''} />
            <InfoRow label={t('product_price')} value={item.price} />
            <InfoRow label={t('order_reserved_until')} value={formatDateOnly(item.reservationDate)} />
            <InfoRow label={t('customer_select')} value={item.clientName} />
            <InfoRow label={t('address_label')} value={item.clientAddress} />
            <InfoRow label={t('contact_label')} value={item.clientRepresentative} />
            <InfoRow label={t('product_supplier')} value={item.distributor} />
            <InfoRow label={t('packaging_type_label')} value={item.packagingType} />
            <InfoRow label={t('product_mfi')} value={item.mfi} />
            <InfoRow label={t('special_payment_condition')} value={item.specialPaymentCondition ? 'Ja' : 'Nein'} />
            <InfoRow label={t('order_comment')} value={item.comment} />
            <InfoRow label={t('delivery_start')} value={formatDateOnly(item.deliveryStartDate)} />
            <InfoRow label={t('delivery_end')} value={formatDateOnly(item.deliveryEndDate)} />
            <InfoRow label={t('order_created')} value={formatDateOnly(item.createdAt)} />
            <Divider sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

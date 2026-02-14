import React from 'react';
import {
  Alert,
  Box,
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
import { getMandant } from '../utils/mandant.js';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
}

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE');
}

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ maxWidth: '60%', textAlign: 'right', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
      >
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest(`/orders/${encodeURIComponent(id)}`);
        if (!alive) return;
        setItem(res?.data || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, t]);

  const mandant = getMandant();
  const isReserved = Boolean(item?.isReserved);
  const handleBack = React.useCallback(() => {
    const fromOrders = location.state?.fromOrders;
    if (fromOrders) {
      navigate('/orders', { state: { listState: fromOrders } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {item?.orderNumber || id}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && item && (
        <Card>
          <CardContent sx={{ pt: 2 }}>
            {!isReserved && <InfoRow label={t('order_customer')} value={item.clientName} />}
            <InfoRow label={t('order_distributor')} value={mandant} />
            <InfoRow label={t('order_article')} value={item.article} />
            <InfoRow label={t('order_price')} value={formatPrice(item.price)} />
            {item?.isReserved && <InfoRow label={t('order_reserve_amount')} value={item.reserveAmount ? `${item.reserveAmount} ${item.unit || 'kg'}` : ''} />}
            <InfoRow label={t('order_closing')} value={item.closingDate} />
            <InfoRow label={t('order_reserved_until')} value={formatDateOnly(item.reservationDate)} />
            {!isReserved && <InfoRow label={t('order_created')} value={item.createdAt} />}
            <InfoRow label={t('order_owner')} value={item.receivedFrom} />
            <InfoRow label={t('order_passed_to')} value={item.passedTo} />
            {item?.isReserved && <InfoRow label={t('order_comment')} value={item.comment} />}
            <Divider sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

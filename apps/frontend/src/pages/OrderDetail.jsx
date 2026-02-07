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
import { useNavigate, useParams } from 'react-router-dom';
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

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ width: '40%', textAlign: 'right' }}>
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={() => navigate(-1)}>
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
            <InfoRow label={t('order_closing')} value={item.closingDate} />
            <InfoRow label={t('order_reserved_until')} value={item.reservationDate} />
            {!isReserved && <InfoRow label={t('order_created')} value={item.createdAt} />}
            <InfoRow label={t('order_owner')} value={item.receivedFrom} />
            <InfoRow label={t('order_passed_to')} value={item.passedTo} />
            <Divider sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

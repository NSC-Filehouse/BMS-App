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
import { useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

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

export default function ProductDetail() {
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
        const res = await apiRequest(`/products/${encodeURIComponent(id)}`);
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

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={() => navigate(-1)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {item?.article || id}
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
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('product_price')}
              </Typography>
              <Typography variant="h6">{formatPrice(item.acquisitionPrice)}</Typography>
            </Box>

            <Button variant="contained" fullWidth disabled sx={{ mb: 2 }}>
              {t('product_add_to_order')}
            </Button>

            <Divider sx={{ my: 2 }} />

            <InfoRow label={t('product_be_number')} value={item.beNumber} />
            <InfoRow label={t('product_reserved')} value={item.reserved} />
            <InfoRow label={t('product_category')} value={item.category} />
            <InfoRow label={t('product_amount')} value={item.amount} />
            <InfoRow label={t('product_unit')} value={item.unit} />
            <InfoRow label={t('product_article')} value={item.article} />
            <InfoRow label={t('product_warehouse')} value={item.warehouse} />

            <Divider sx={{ my: 2 }} />

            <InfoRow label={t('product_supplier')} value={item.packaging} />
            <InfoRow label={t('product_description')} value={item.description} />
            <InfoRow label={t('product_mfi')} value={item.mfi} />

            <Divider sx={{ my: 2 }} />

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('product_extra')}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                {item.about || ''}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

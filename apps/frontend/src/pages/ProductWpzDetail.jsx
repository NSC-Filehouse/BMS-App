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

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function InfoRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '58%' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ width: '40%', textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function ProductWpzDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest(`/products/${encodeURIComponent(id)}/wpz`);
        if (!alive) return;
        setData(res?.data || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, t]);

  const handleBack = React.useCallback(() => {
    const fromProduct = location.state?.fromProduct || {};
    navigate(`/products/${encodeURIComponent(id)}`, {
      state: { fromProducts: fromProduct.fromProducts || null },
    });
  }, [id, location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {t('wpz_title')}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && data && !data.exists && (
        <Alert severity="info">{t('wpz_not_available')}</Alert>
      )}

      {!loading && !error && data && data.exists && (
        <Card>
          <CardContent sx={{ pt: 2 }}>
            <InfoRow label={t('product_be_number')} value={formatValue(data.beNumber)} />
            <Divider sx={{ my: 2 }} />
            {(Array.isArray(data.fields) ? data.fields : []).map((field, idx) => (
              <InfoRow
                key={`${field?.key || 'field'}-${idx}`}
                label={String(field?.key || '-')}
                value={formatValue(field?.value)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';

const PAGE_SIZE = 12;
const SEARCH_PAGE_SIZE = 12;

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  return `${value} €`;
}

function ProductCard({ item, onClick, t }) {
  return (
    <Card
      sx={{
        borderRadius: 2,
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      <CardContent sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
            {item.article || '-'}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {item.category || '-'}
            </Typography>
            <Typography variant="body2">
              {item.amount || ''} {item.unit || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t('product_reserved')}
            </Typography>
            <Typography variant="body2">
              {item.reserved || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ width: '70%' }}>
              {item.about || ''}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatPrice(item.acquisitionPrice)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t('product_warehouse')}
            </Typography>
            <Typography variant="body2">
              {item.warehouse || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t('product_description')}
            </Typography>
            <Typography variant="body2" sx={{ width: '60%', textAlign: 'right' }}>
              {item.description || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {t('product_be_number')}
            </Typography>
            <Typography variant="body2">
              {item.beNumber || ''}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRightIcon />
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ProductsList() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [q, setQ] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);

  React.useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  React.useEffect(() => {
    qRef.current = q;
  }, [q]);

  const loadProducts = React.useCallback(async (opts = {}) => {
    const currentMeta = metaRef.current || {};
    const page = opts.page ?? currentMeta.page ?? 1;
    const pageSize = SEARCH_PAGE_SIZE;
    const qVal = opts.q ?? qRef.current ?? '';

    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/products?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}&sort=article&dir=ASC`);
      setItems(res?.data || []);
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      setError(e?.message || t('loading_products_error'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProducts({ page: 1, q: '' });
  }, [loadProducts]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const qVal = q.trim();
      if (qVal.length === 0 || qVal.length >= SEARCH_MIN) {
        loadProducts({ page: 1, q: qVal });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q, loadProducts]);

  const showSearchResults = true;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">
          {t('products_title')}
        </Typography>
        {showSearchResults && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              aria-label="zurueck"
              onClick={() => loadProducts({ page: Math.max((meta.page || 1) - 1, 1), q })}
              disabled={(meta.page || 1) <= 1}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
              {t('page_label')} {meta.page || 1}
            </Typography>
            <IconButton
              aria-label="weiter"
              onClick={() => loadProducts({ page: (meta.page || 1) + 1, q })}
              disabled={meta.total !== null && meta.total !== undefined
                ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total
                : false}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Box>
        )}
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('products_search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ opacity: 0.6 }} />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ flexGrow: 1 }} />
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {showSearchResults && !loading && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>{t('products_empty')}</Typography>
      )}

      {showSearchResults && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              t={t}
              onClick={() => navigate(`/products/${encodeURIComponent(item.id)}`)}
            />
          ))}
        </Box>
      )}

      </Box>
    </Box>
  );
}

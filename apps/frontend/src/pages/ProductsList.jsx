import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
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
      <CardContent sx={{ display: 'flex', gap: 1.5, p: 1.25 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" sx={{ mb: 0.25, fontWeight: 600 }}>
            {item.article || '-'}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>{item.category || '-'}</Typography>
            <Typography variant="caption">{item.amount || ''} {item.unit || ''}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>{t('product_reserved')}</Typography>
            <Typography variant="caption">{item.reserved || ''}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ width: '70%' }}>{item.about || ''}</Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatPrice(item.acquisitionPrice)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>{t('product_warehouse')}</Typography>
            <Typography variant="caption">{item.warehouse || ''}</Typography>
          </Box>
        </Box>
        <Box sx={{ width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRightIcon />
        </Box>
      </CardContent>
    </Card>
  );
}

function subKey(plastic, sub) {
  return `${plastic}||${sub}`;
}

export default function ProductsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [q, setQ] = React.useState('');
  const [categories, setCategories] = React.useState([]);
  const [expandedPlastics, setExpandedPlastics] = React.useState({});
  const [expandedSubs, setExpandedSubs] = React.useState({});
  const [productsBySub, setProductsBySub] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const qRef = React.useRef(q);
  React.useEffect(() => { qRef.current = q; }, [q]);

  const loadCategories = React.useCallback(async (query) => {
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/product-categories?q=${encodeURIComponent(query || '')}`);
      setCategories(res?.data || []);
      setExpandedPlastics({});
      setExpandedSubs({});
      setProductsBySub({});
    } catch (e) {
      setError(e?.message || t('loading_products_error'));
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadProductsForSub = React.useCallback(async (plastic, sub) => {
    const key = subKey(plastic, sub);
    setProductsBySub((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), loading: true, error: '' } }));
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '200',
        q: qRef.current || '',
        sort: 'article',
        dir: 'ASC',
        plastic,
      });
      if (sub) params.set('sub', sub);
      else params.set('subEmpty', '1');

      const res = await apiRequest(`/products?${params.toString()}`);
      setProductsBySub((prev) => ({
        ...prev,
        [key]: { loading: false, error: '', items: res?.data || [] },
      }));
    } catch (e) {
      setProductsBySub((prev) => ({
        ...prev,
        [key]: { loading: false, error: e?.message || t('loading_products_error'), items: [] },
      }));
    }
  }, [t]);

  React.useEffect(() => {
    const listState = location.state?.listState;
    if (listState?.q !== undefined) {
      setQ(String(listState.q || ''));
      loadCategories(String(listState.q || ''));
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    loadCategories('');
  }, [loadCategories, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    const h = setTimeout(() => {
      const query = q.trim();
      if (query.length === 0 || query.length >= SEARCH_MIN) {
        loadCategories(query);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, loadCategories]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">{t('products_title')}</Typography>
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
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && !error && categories.length === 0 && (
          <Typography sx={{ opacity: 0.7 }}>{t('products_empty')}</Typography>
        )}

        {!loading && !error && categories.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {categories.map((cat) => {
              const plastic = String(cat?.plastic || '');
              const catExpanded = Boolean(expandedPlastics[plastic]);
              const subCategories = Array.isArray(cat?.subCategories) ? cat.subCategories : [];
              return (
                <Accordion
                  key={plastic || '__empty_plastic__'}
                  expanded={catExpanded}
                  onChange={(e, expanded) => setExpandedPlastics((prev) => ({ ...prev, [plastic]: expanded }))}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                    <Typography variant="subtitle1">
                      {plastic || t('product_group_empty')}
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 1, opacity: 0.7 }}>
                      ({cat.total || 0})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0.5, pb: 1, pl: 1, pr: 1 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {subCategories.map((subEntry) => {
                        const sub = String(subEntry?.sub || '');
                        const key = subKey(plastic, sub);
                        const subExpanded = Boolean(expandedSubs[key]);
                        const bucket = productsBySub[key] || {};
                        return (
                          <Accordion
                            key={key || '__empty_sub__'}
                            expanded={subExpanded}
                            onChange={async (e, expanded) => {
                              setExpandedSubs((prev) => ({ ...prev, [key]: expanded }));
                              if (expanded && !bucket.items && !bucket.loading) {
                                await loadProductsForSub(plastic, sub);
                              }
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {sub || t('product_subgroup_empty')}
                              </Typography>
                              <Typography variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
                                ({subEntry.total || 0})
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ pt: 0.5, pb: 0.75, pl: 0.5, pr: 0.5 }}>
                              {bucket.loading && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                                  <CircularProgress size={22} />
                                </Box>
                              )}
                              {bucket.error && <Alert severity="error" sx={{ mb: 1 }}>{bucket.error}</Alert>}
                              {!bucket.loading && !bucket.error && Array.isArray(bucket.items) && bucket.items.length === 0 && (
                                <Typography sx={{ opacity: 0.7 }}>{t('products_empty')}</Typography>
                              )}
                              {!bucket.loading && !bucket.error && Array.isArray(bucket.items) && bucket.items.length > 0 && (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  {bucket.items.map((item) => (
                                    <ProductCard
                                      key={item.id}
                                      item={item}
                                      t={t}
                                      onClick={() => navigate(`/products/${encodeURIComponent(item.id)}`, {
                                        state: { fromProducts: { q } },
                                      })}
                                    />
                                  ))}
                                </Box>
                              )}
                            </AccordionDetails>
                          </Accordion>
                        );
                      })}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

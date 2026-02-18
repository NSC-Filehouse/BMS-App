import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';
import { addOrderCartItem, getOrderCartCount } from '../utils/orderCart.js';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
}

function ProductCard({ item, onClick, onAddToCart, t }) {
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
          <Typography variant="body2" sx={{ mb: 0.35, fontWeight: 700 }}>
            {item.article || '-'}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {item.category || '-'}
            </Typography>
            <Typography variant="caption">
              {item.amount || ''} {item.unit || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {t('product_reserved')}
            </Typography>
            <Typography variant="caption">
              {item.reserved || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ width: '70%' }}>
              {item.about || ''}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right', minWidth: 92 }}
            >
              {formatPrice(item.acquisitionPrice)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {t('product_warehouse')}
            </Typography>
            <Typography variant="caption">
              {item.warehouse || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {t('product_description')}
            </Typography>
            <Typography variant="caption" sx={{ width: '60%', textAlign: 'right' }}>
              {item.description || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              {t('product_be_number')}
            </Typography>
            <Typography variant="caption">
              {item.beNumber || ''}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            width: 40,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            py: 0.25,
          }}
        >
          <IconButton
            size="small"
            aria-label={t('cart_add')}
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(item);
            }}
          >
            <ShoppingCartIcon fontSize="small" />
          </IconButton>
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
  const [searchResults, setSearchResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [cartCount, setCartCount] = React.useState(() => getOrderCartCount());
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [addItem, setAddItem] = React.useState(null);
  const [addQty, setAddQty] = React.useState('');
  const [addSuccess, setAddSuccess] = React.useState('');

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
      setSearchResults([]);
    } catch (e) {
      setError(e?.message || t('loading_products_error'));
      setCategories([]);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadSearchResults = React.useCallback(async (query) => {
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/products?page=1&pageSize=300&q=${encodeURIComponent(query)}&sort=article&dir=ASC`);
      setSearchResults(res?.data || []);
      setCategories([]);
      setExpandedPlastics({});
      setExpandedSubs({});
      setProductsBySub({});
    } catch (e) {
      setError(e?.message || t('loading_products_error'));
      setSearchResults([]);
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
    setCartCount(getOrderCartCount());
  }, [addDialogOpen]);

  React.useEffect(() => {
    const h = setTimeout(() => {
      const query = q.trim();
      if (query.length === 0) {
        loadCategories('');
        return;
      }
      if (query.length >= SEARCH_MIN) {
        loadSearchResults(query);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [q, loadCategories, loadSearchResults]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">{t('products_title')}</Typography>
        <IconButton aria-label={t('cart_open')} color="primary" onClick={() => navigate('/order-cart')}>
          <Badge badgeContent={cartCount} color="error">
            <ShoppingCartIcon />
          </Badge>
        </IconButton>
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
        {addSuccess && <Alert severity="success" sx={{ mb: 2 }}>{addSuccess}</Alert>}

        {!loading && !error && q.trim().length === 0 && categories.length === 0 && (
          <Typography sx={{ opacity: 0.7 }}>{t('products_empty')}</Typography>
        )}

        {!loading && !error && q.trim().length >= SEARCH_MIN && searchResults.length === 0 && (
          <Typography sx={{ opacity: 0.7 }}>{t('products_empty')}</Typography>
        )}

        {!loading && !error && q.trim().length >= SEARCH_MIN && searchResults.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {searchResults.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                t={t}
                onAddToCart={(product) => {
                  setAddItem(product);
                  setAddQty('');
                  setAddDialogOpen(true);
                }}
                onClick={() => navigate(`/products/${encodeURIComponent(item.id)}`, {
                  state: { fromProducts: { q } },
                })}
              />
            ))}
          </Box>
        )}

        {!loading && !error && q.trim().length === 0 && categories.length > 0 && (
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
                                      onAddToCart={(product) => {
                                        setAddItem(product);
                                        setAddQty('');
                                        setAddDialogOpen(true);
                                      }}
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

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('cart_add')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>{addItem?.article || '-'}</Typography>
          <TextField
            margin="dense"
            fullWidth
            type="number"
            label={t('cart_quantity')}
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            inputProps={{ min: 1, step: 'any' }}
            helperText={addItem ? `${t('product_available_now')}: ${Math.max(Number(addItem.amount || 0) - Number(addItem.reserved || 0), 0)} ${addItem.unit || ''}` : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(addQty);
              const available = Math.max(Number(addItem?.amount || 0) - Number(addItem?.reserved || 0), 0);
              if (!Number.isFinite(qty) || qty <= 0) {
                setError(t('validation_cart_quantity_positive'));
                return;
              }
              if (qty > available) {
                setError(t('validation_cart_quantity_not_above_available'));
                return;
              }
              addOrderCartItem(addItem, qty);
              setCartCount(getOrderCartCount());
              setAddDialogOpen(false);
              setAddSuccess(t('cart_added'));
            }}
          >
            {t('cart_add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

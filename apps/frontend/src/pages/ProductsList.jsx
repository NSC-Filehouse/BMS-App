import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
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
import { addOrderCartItem } from '../utils/orderCart.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import CustomerRequiredDialog from '../components/CustomerRequiredDialog.jsx';

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
        width: '100%',
        minWidth: 0,
      }}
      onClick={onClick}
    >
      <CardContent sx={{ display: 'flex', gap: 1.5, p: 1.25, minWidth: 0 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ mb: 0.35, minWidth: 0, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {item.article || '-'}
          </Typography>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.category || '-'}
            </Typography>
            <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.amount || ''} {item.unit || ''}
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {t('product_reserved')}
            </Typography>
            <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.reserved || ''}
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ width: { xs: '100%', md: '70%' }, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.about || ''}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, whiteSpace: 'nowrap', textAlign: { xs: 'left', md: 'right' }, minWidth: { xs: 0, md: 92 }, overflowWrap: 'anywhere' }}
            >
              {formatPrice(item.acquisitionPrice)}
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {t('product_warehouse')}
            </Typography>
            <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.warehouse || ''}
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {t('product_description')}
            </Typography>
            <Typography variant="caption" sx={{ width: { xs: '100%', md: '60%' }, maxWidth: { xs: '100%', md: '60%' }, minWidth: 0, textAlign: { xs: 'left', md: 'right' }, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.description || ''}
            </Typography>
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: 'minmax(0, 1fr)', justifyContent: 'space-between', gap: { xs: 0.25, md: 2 }, minWidth: 0 }}>
            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.7, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {t('product_be_number')}
            </Typography>
            <Typography variant="caption" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item.beNumber || ''}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            width: 40,
            minWidth: 40,
            flex: '0 0 40px',
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
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [addItem, setAddItem] = React.useState(null);
  const [addQty, setAddQty] = React.useState('');
  const [addError, setAddError] = React.useState('');
  const [addSuccess, setAddSuccess] = React.useState('');
  const [customerRequiredOpen, setCustomerRequiredOpen] = React.useState(false);
  const [pendingCustomerAction, setPendingCustomerAction] = React.useState(null);

  const qRef = React.useRef(q);
  React.useEffect(() => { qRef.current = q; }, [q]);

  const openAddDialog = React.useCallback((product) => {
    setAddItem(product);
    const available = Math.max(Number(product?.amount || 0) - Number(product?.reserved || 0), 0);
    setAddQty(Number.isFinite(available) ? String(available) : '');
    setAddError('');
    setAddDialogOpen(true);
  }, []);

  const requestAddToCart = React.useCallback((product) => {
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction({ type: 'cart', product });
      setCustomerRequiredOpen(true);
      return;
    }
    openAddDialog(product);
  }, [openAddDialog]);

  const chooseCustomer = React.useCallback(() => {
    if (!pendingCustomerAction) return;
    setCustomerRequiredOpen(false);
    navigate('/customers', {
      state: {
        afterSelect: {
          to: '/products',
          state: { pendingCustomerAction },
        },
      },
    });
  }, [navigate, pendingCustomerAction]);

  React.useEffect(() => {
    const pending = location.state?.pendingCustomerAction;
    if (!pending?.product || pending.type !== 'cart' || !getSelectedCustomer()?.id) return;

    const nextState = { ...(location.state || {}) };
    delete nextState.pendingCustomerAction;
    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });
    openAddDialog(pending.product);
  }, [location.pathname, location.state, navigate, openAddDialog]);

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
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, minWidth: 0 }}>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{t('products_title')}</Typography>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
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

      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
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
                onAddToCart={requestAddToCart}
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
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{ minHeight: 44, minWidth: 0, '& .MuiAccordionSummary-content': { my: 0.5, minWidth: 0 } }}
                  >
                    <Typography variant="subtitle1" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
                            <AccordionSummary
                              expandIcon={<ExpandMoreIcon />}
                              sx={{ minHeight: 40, minWidth: 0, '& .MuiAccordionSummary-content': { my: 0.5, minWidth: 0 } }}
                            >
                              <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
                                      onAddToCart={requestAddToCart}
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
          {addError && <Alert severity="error" sx={{ mb: 1 }}>{addError}</Alert>}
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
          <Button onClick={() => { setAddError(''); setAddDialogOpen(false); }}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(addQty);
              const available = Math.max(Number(addItem?.amount || 0) - Number(addItem?.reserved || 0), 0);
              if (!Number.isFinite(qty) || qty <= 0) {
                setAddError(t('validation_cart_quantity_positive'));
                return;
              }
              if (qty > available) {
                setAddError(t('validation_cart_quantity_not_above_available'));
                return;
              }
              setAddError('');
              addOrderCartItem(addItem, qty);
              setAddDialogOpen(false);
              setAddSuccess(t('cart_added'));
            }}
          >
            {t('cart_add')}
          </Button>
        </DialogActions>
      </Dialog>

      <CustomerRequiredDialog
        open={customerRequiredOpen}
        onClose={() => {
          setCustomerRequiredOpen(false);
          setPendingCustomerAction(null);
        }}
        onChoose={chooseCustomer}
      />
    </Box>
  );
}

import React from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { addOrderCartItem, getOrderCartCount } from '../utils/orderCart.js';

const PAGE_SIZE = 100;
const SWIPE_ACTION_WIDTH = 98;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatNumber(value, fractionDigits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function buildGroupTitle(item, lang) {
  const unknown = lang === 'en' ? 'unknown' : 'unbekannt';
  const main = asText(item?.plastic) || unknown;
  const sub = asText(item?.plasticSubCategory) || unknown;
  return `${main}-${sub}`;
}

function buildLine(item) {
  const amount = formatNumber(item?.amount, 0);
  const unit = asText(item?.unit);
  const article = asText(item?.article);
  const mfiValue = item?.mfiMeasured ?? item?.mfi;
  const mfi = Number.isFinite(Number(mfiValue)) ? formatNumber(mfiValue, 2).replace(/,00$/, '') : '';
  const mfiMethod = asText(item?.mfiTestMethod);
  const price = Number.isFinite(Number(item?.acquisitionPrice))
    ? formatNumber(item.acquisitionPrice, 0)
    : asText(item?.acquisitionPrice);
  const warehouse = asText(item?.warehouse);
  const beNumber = asText(item?.beNumber);
  const remark = asText(item?.about);

  let line = `${amount} ${unit} ${article}`.trim();
  if (mfi) {
    line += ` MFI ${mfi}`;
    if (mfiMethod) line += ` (${mfiMethod})`;
  }
  if (price) line += ` zu ${price}`;
  if (warehouse) line += ` ex ${warehouse}`;
  if (beNumber) line += ` ${beNumber}`;
  if (remark) line += ` - ${remark}`;

  return line;
}

export default function VlList() {
  const navigate = useNavigate();
  const { lang, t } = useI18n();
  const isFinePointer = useMediaQuery('(pointer: fine)');

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [initialLoaded, setInitialLoaded] = React.useState(false);
  const [revealedRowId, setRevealedRowId] = React.useState('');
  const [cartCount, setCartCount] = React.useState(() => getOrderCartCount());
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [addItem, setAddItem] = React.useState(null);
  const [addQty, setAddQty] = React.useState('');
  const [addError, setAddError] = React.useState('');

  const hasMore = items.length < total;
  const sentinelRef = React.useRef(null);
  const loadingRef = React.useRef(false);
  const touchRef = React.useRef({ x: 0, y: 0 });
  const normalizedSearch = String(searchInput || '').trim();
  const effectiveQuery = normalizedSearch.length >= 2 ? normalizedSearch : '';

  const openAddDialog = React.useCallback((item) => {
    setAddItem(item);
    setAddQty('');
    setAddError('');
    setAddDialogOpen(true);
  }, []);

  const loadPage = React.useCallback(async (nextPage, query, replace) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
        sort: 'vl',
        dir: 'ASC',
      });
      if (query) params.set('q', query);

      const res = await apiRequest(`/products?${params.toString()}`);
      const data = Array.isArray(res?.data) ? res.data : [];
      const nextTotal = Number(res?.meta?.total || 0);
      setItems((prev) => (replace ? data : [...prev, ...data]));
      setPage(nextPage);
      setTotal(nextTotal);
      setInitialLoaded(true);
      setRevealedRowId('');
    } catch (e) {
      setError(e?.message || 'Fehler beim Laden.');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  const loadNextPage = React.useCallback(async () => {
    if (loadingRef.current) return;
    if (initialLoaded && !hasMore) return;
    const nextPage = page + 1;
    await loadPage(nextPage, effectiveQuery, false);
  }, [effectiveQuery, hasMore, initialLoaded, loadPage, page]);

  React.useEffect(() => {
    setItems([]);
    setPage(0);
    setTotal(0);
    setInitialLoaded(false);
    void loadPage(1, effectiveQuery, true);
  }, [effectiveQuery, loadPage]);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      void loadNextPage();
    }, { rootMargin: '250px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNextPage]);

  const handleRowTap = React.useCallback((itemId) => {
    if (revealedRowId && String(revealedRowId) === String(itemId)) {
      setRevealedRowId('');
      return;
    }
    navigate(`/products/${encodeURIComponent(itemId)}`, { state: { fromVl: true } });
  }, [navigate, revealedRowId]);

  let lastGroup = '';

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', pb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
        <Typography variant="h5">VL</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            aria-label="vl-search-toggle"
            onClick={() => {
              if (searchOpen) {
                setSearchInput('');
                setSearchOpen(false);
                return;
              }
              setSearchOpen(true);
            }}
          >
            <SearchIcon />
          </IconButton>
          <IconButton
            aria-label={t('cart_open')}
            onClick={() => navigate('/order-cart', { state: { fromVl: true } })}
          >
            <Badge badgeContent={cartCount} color="error">
              <ShoppingCartIcon />
            </Badge>
          </IconButton>
        </Box>
      </Box>

      {searchOpen && (
        <TextField
          fullWidth
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          autoFocus
          placeholder="Suchen..."
          sx={{ mb: 1.25 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ opacity: 0.65 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="clear-search"
                  onClick={() => {
                    setSearchInput('');
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      )}

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {items.map((item, index) => {
          const group = buildGroupTitle(item, lang);
          const showHeader = group !== lastGroup;
          if (showHeader) lastGroup = group;
          const rowId = String(item.id || '');
          const isRevealed = !isFinePointer && rowId === String(revealedRowId || '');

          return (
            <Box key={item.id} sx={{ mb: 0.4 }}>
              {showHeader && (
                <Typography variant="subtitle2" sx={{ mt: 1.2, mb: 0.35, fontWeight: 700 }}>
                  {group}
                </Typography>
              )}

              <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 0.5 }}>
                {!isFinePointer && (
                  <Box
                    sx={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${SWIPE_ACTION_WIDTH}px`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'primary.main',
                      transform: isRevealed ? 'translateX(0)' : 'translateX(100%)',
                      transition: 'transform 160ms ease',
                    }}
                  >
                    <Button
                      size="small"
                      sx={{ color: '#fff', minWidth: 0, px: 0.75 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddDialog(item);
                      }}
                    >
                      {t('cart_add')}
                    </Button>
                  </Box>
                )}

                <Box
                  className="vl-row"
                  onTouchStart={(e) => {
                    const touch = e.changedTouches?.[0];
                    touchRef.current = {
                      x: Number(touch?.clientX || 0),
                      y: Number(touch?.clientY || 0),
                    };
                  }}
                  onTouchEnd={(e) => {
                    if (isFinePointer) return;
                    const touch = e.changedTouches?.[0];
                    const x = Number(touch?.clientX || 0);
                    const y = Number(touch?.clientY || 0);
                    const dx = x - touchRef.current.x;
                    const dy = y - touchRef.current.y;
                    if (Math.abs(dx) < Math.abs(dy)) return;
                    if (dx <= -35) {
                      setRevealedRowId(rowId);
                    } else if (dx >= 35) {
                      setRevealedRowId('');
                    }
                  }}
                  onClick={() => handleRowTap(rowId)}
                  sx={{
                    position: 'relative',
                    transform: isRevealed ? `translateX(-${SWIPE_ACTION_WIDTH}px)` : 'translateX(0)',
                    transition: 'transform 160ms ease',
                    px: 0.75,
                    py: 0.45,
                    borderRadius: 0.5,
                    cursor: 'pointer',
                    backgroundColor: index % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.35,
                    pr: isFinePointer ? 4.5 : 0.75,
                    '& .vl-row-add': {
                      opacity: 0,
                      pointerEvents: 'none',
                    },
                    '&:hover .vl-row-add': isFinePointer ? {
                      opacity: 1,
                      pointerEvents: 'auto',
                    } : undefined,
                  }}
                >
                  <Typography variant="body2">
                    {buildLine(item)}
                  </Typography>

                  {isFinePointer && (
                    <IconButton
                      className="vl-row-add"
                      size="small"
                      color="primary"
                      aria-label={t('cart_add')}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddDialog(item);
                      }}
                      sx={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        bgcolor: 'rgba(255,255,255,0.95)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        '&:hover': { bgcolor: '#fff' },
                      }}
                    >
                      <AddShoppingCartIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box ref={sentinelRef} sx={{ height: 18 }} />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <CircularProgress size={22} />
        </Box>
      )}

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('cart_add')}</DialogTitle>
        <DialogContent>
          {!!addError && <Alert severity="error" sx={{ mb: 1 }}>{addError}</Alert>}
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
                setAddError(t('validation_cart_quantity_positive'));
                return;
              }
              if (qty > available) {
                setAddError(t('validation_cart_quantity_not_above_available'));
                return;
              }
              setAddError('');
              addOrderCartItem(addItem, qty);
              setCartCount(getOrderCartCount());
              setAddDialogOpen(false);
              setRevealedRowId('');
            }}
          >
            {t('cart_add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

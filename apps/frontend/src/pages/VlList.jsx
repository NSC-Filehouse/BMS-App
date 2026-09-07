import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';
import { getSelectableMandants } from '../utils/mandantOptions.js';
import {
  addOrderCartItem,
  getOrderCartItems,
  ORDER_CART_CHANGED,
  removeOrderCartItem,
} from '../utils/orderCart.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import CustomerRequiredDialog from '../components/CustomerRequiredDialog.jsx';
import WpzCommentField from '../components/WpzCommentField.jsx';
import SaleMarginHint from '../components/SaleMarginHint.jsx';
import TempPlanningHint from '../components/TempPlanningHint.jsx';

const PAGE_SIZE = 100;
const GROUP_PAGE_SIZE = 40;
const SWIPE_CART_WIDTH = 112;
const SWIPE_LEFT_WIDTH = 190;
const LONG_PRESS_MS = 550;

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

function formatQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getPositionLabel(count, t) {
  return Number(count) === 1 ? t('position_singular') : t('position_plural');
}

function getItemId(item) {
  return String(item?.id || '').trim();
}

function getAvailableAmount(item) {
  const backendAmount = Number(item?.availableAmount);
  if (Number.isFinite(backendAmount)) return Math.max(backendAmount, 0);
  return Math.max(Number(item?.amount || 0) - Number(item?.reserved || 0), 0);
}

function buildGroupTitle(item, lang) {
  const unknown = lang === 'en' ? 'unknown' : 'unbekannt';
  const main = asText(item?.plastic) || unknown;
  const sub = asText(item?.plasticSubCategory) || unknown;
  return `${main}-${sub}`;
}

function getGroupInfo(item, lang) {
  const key = asText(item?.groupKey);
  const name = asText(item?.groupName);
  if (key || name) {
    return {
      key: key || `name:${name.toLowerCase()}`,
      name: name || buildGroupTitle(item, lang),
    };
  }
  const fallback = buildGroupTitle(item, lang);
  return { key: `category:${fallback.toLowerCase()}`, name: fallback };
}

function buildLineParts(item) {
  const amount = formatNumber(item?.amount, 0);
  const unit = asText(item?.unit);
  const article = asText(item?.article);
  const mfiValue = item?.mfiMeasured ?? item?.mfi;
  const mfi = Number.isFinite(Number(mfiValue))
    ? formatNumber(mfiValue, 2).replace(/,00$/, '')
    : '';
  const mfiMethod = asText(item?.mfiTestMethod);
  const price = Number.isFinite(Number(item?.acquisitionPrice))
    ? formatNumber(item.acquisitionPrice, 0)
    : asText(item?.acquisitionPrice);
  const warehouse = asText(item?.warehouse);
  const beNumber = asText(item?.beNumber);
  const remark = asText(item?.about);

  let main = `${amount} ${unit} ${article}`.trim();
  if (mfi) {
    main += ` MFI ${mfi}`;
    if (mfiMethod) main += ` (${mfiMethod})`;
  }
  if (price) main += ` zu ${price}`;
  if (warehouse) main += ` ex ${warehouse}`;
  if (beNumber) main += ` ${beNumber}`;

  return { main, remark };
}

function buildSelectedGroups(items, lang) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const info = getGroupInfo(item, lang);
    const group = groups.get(info.key) || { ...info, items: [] };
    group.items.push(item);
    groups.set(info.key, group);
  }
  return Array.from(groups.values()).sort((left, right) => left.name.localeCompare(right.name, 'de'));
}

function SwipeableProductRow({
  item,
  selected,
  variant,
  index,
  isFinePointer,
  revealedRow,
  onReveal,
  onToggleSelection,
  onTap,
  onAction,
  onDetails,
  onEmployeeClick,
  inCart,
  readOnly,
  t,
}) {
  const rowId = getItemId(item);
  // VL actions are intentionally direct; horizontal swipe is disabled in both views.
  const swipeEnabled = false;
  const interactionRef = React.useRef({
    x: 0,
    y: 0,
    moved: false,
    longPressed: false,
    timer: null,
  });
  const suppressClickRef = React.useRef('');

  const clearLongPress = React.useCallback(() => {
    if (interactionRef.current.timer) {
      window.clearTimeout(interactionRef.current.timer);
      interactionRef.current.timer = null;
    }
  }, []);

  React.useEffect(() => clearLongPress, [clearLongPress]);

  const isCartRevealed = swipeEnabled && !isFinePointer
    && String(revealedRow?.id || '') === rowId
    && revealedRow?.side === 'cart';
  const isLeftRevealed = swipeEnabled && !isFinePointer
    && String(revealedRow?.id || '') === rowId
    && revealedRow?.side === 'left';

  const handleTouchStart = (event) => {
    if (isFinePointer || readOnly) return;
    const touch = event.changedTouches?.[0];
    const state = interactionRef.current;
    clearLongPress();
    state.x = Number(touch?.clientX || 0);
    state.y = Number(touch?.clientY || 0);
    state.moved = false;
    state.longPressed = false;
    state.timer = window.setTimeout(() => {
      if (state.moved) return;
      state.longPressed = true;
      suppressClickRef.current = rowId;
      onReveal('', '');
      onToggleSelection(item);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (event) => {
    if (isFinePointer || readOnly) return;
    const touch = event.changedTouches?.[0];
    const state = interactionRef.current;
    const dx = Number(touch?.clientX || 0) - state.x;
    const dy = Number(touch?.clientY || 0) - state.y;
    if (Math.sqrt((dx * dx) + (dy * dy)) > 10) {
      state.moved = true;
      clearLongPress();
    }
  };

  const handleTouchEnd = (event) => {
    if (isFinePointer || readOnly) return;
    const touch = event.changedTouches?.[0];
    const state = interactionRef.current;
    const dx = Number(touch?.clientX || 0) - state.x;
    const dy = Number(touch?.clientY || 0) - state.y;
    clearLongPress();
    if (state.longPressed) return;
    if (!swipeEnabled) {
      if (state.moved) suppressClickRef.current = rowId;
      return;
    }
    if (Math.abs(dx) < Math.abs(dy) || Math.abs(dx) < 35) return;
    suppressClickRef.current = rowId;
    if (dx <= -35) onReveal(rowId, 'cart');
    else onReveal(rowId, 'left');
  };

  const handleClick = () => {
    if (suppressClickRef.current === rowId) {
      suppressClickRef.current = '';
      return;
    }
    onTap(rowId);
  };

  const availableAmount = getAvailableAmount(item);
  const unavailable = availableAmount <= 0;
  const parts = buildLineParts(item);
  const surfaceSx = {
    position: 'relative',
    transform: isCartRevealed
      ? `translateX(-${SWIPE_CART_WIDTH}px)`
      : (isLeftRevealed ? `translateX(${SWIPE_LEFT_WIDTH}px)` : 'translateX(0)'),
    transition: 'transform 160ms ease',
    px: variant === 'grouped' ? 0 : 0.75,
    py: variant === 'grouped' ? 0 : 0.45,
    borderRadius: 0.5,
    cursor: 'pointer',
    border: variant === 'grouped' ? '1px solid' : undefined,
    borderColor: inCart ? 'success.main' : (selected ? 'success.light' : 'divider'),
    backgroundColor: inCart
      ? '#C8E6C9'
      : (selected
        ? '#E8F5E9'
        : (variant === 'grouped' ? 'background.paper' : (index % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent'))),
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    lineHeight: 1.35,
    pr: 9.5,
    '& .vl-row-action': {
      opacity: isFinePointer ? 0 : 1,
      pointerEvents: isFinePointer ? 'none' : 'auto',
    },
    '&:hover .vl-row-action': isFinePointer ? {
      opacity: 1,
      pointerEvents: 'auto',
    } : undefined,
  };

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 0.5 }}>
      {swipeEnabled && !isFinePointer && (
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${SWIPE_LEFT_WIDTH}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.25,
            bgcolor: 'success.dark',
            transform: isLeftRevealed ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 160ms ease',
          }}
        >
          <Button
            size="small"
            sx={{ color: '#fff', minWidth: 0, px: 0.55, fontSize: '0.7rem' }}
            onClick={(event) => {
              event.stopPropagation();
              onAction('select', item);
            }}
          >
            {selected ? t('vl_deselect') : t('vl_select')}
          </Button>
          <Button
            size="small"
            sx={{ color: '#fff', minWidth: 0, px: 0.55, fontSize: '0.7rem' }}
            onClick={(event) => {
              event.stopPropagation();
              onAction('reserve', item);
            }}
          >
            {t('product_reserve_swipe')}
          </Button>
        </Box>
      )}

      {swipeEnabled && !isFinePointer && (
        <Box
          sx={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${SWIPE_CART_WIDTH}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'primary.main',
            transform: isCartRevealed ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 160ms ease',
          }}
        >
          <Button
            size="small"
            sx={{ color: '#fff', minWidth: 0, px: 0.75, fontSize: '0.72rem' }}
            onClick={(event) => {
              event.stopPropagation();
              onAction('cart', item);
            }}
          >
            {t('cart_add')}
          </Button>
        </Box>
      )}

      <Box
        className="vl-row-surface"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={clearLongPress}
        onClick={handleClick}
        sx={surfaceSx}
      >
        {variant === 'grouped' ? (
          <Card variant="outlined" sx={{ border: 0, boxShadow: 'none', bgcolor: 'transparent' }}>
            <CardContent sx={{ py: '5px !important', px: '8px !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                {!readOnly && (
                  <Checkbox
                    size="small"
                    checked={selected}
                    disabled={unavailable && !selected}
                    onTouchStart={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleSelection(item)}
                    inputProps={{ 'aria-label': `${item.article || '-'} ${item.beNumber || ''}`.trim() }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.84rem', overflowWrap: 'anywhere' }}>
                    {item.article || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                    {`${formatQuantity(availableAmount)} ${item.unit || 'kg'} · ${item.warehouse || item.warehouseId || '-'} · ${t('product_be_number')}: ${item.beNumber || '-'}`}
                  </Typography>
                  {parts.remark && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'error.main', overflowWrap: 'anywhere' }}>
                      {parts.remark}
                    </Typography>
                  )}
                  <TempPlanningHint item={item} onEmployeeClick={onEmployeeClick} t={t} />
                </Box>
                {item.id && (
                  <Button
                    size="small"
                    onTouchStart={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDetails(item.id);
                    }}
                  >
                    {t('vl_details')}
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {!readOnly && (
              <Checkbox
                size="small"
                checked={selected}
                disabled={unavailable && !selected}
                onTouchStart={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={() => onToggleSelection(item)}
                inputProps={{ 'aria-label': `${item.article || '-'} ${item.beNumber || ''}`.trim() }}
                sx={{ p: 0.25, mr: 0.35 }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ minWidth: 0 }}>
                {parts.main}
                {parts.remark ? (
                  <Box component="span" sx={{ color: 'error.main' }}>
                    {` - ${parts.remark}`}
                  </Box>
                ) : null}
              </Typography>
              <TempPlanningHint item={item} onEmployeeClick={onEmployeeClick} t={t} />
            </Box>
          </Box>
        )}

        {isFinePointer && !readOnly && (
          <IconButton
            className="vl-row-action"
            size="small"
            color={selected ? 'success' : 'default'}
            disabled={unavailable && !selected}
            aria-label={selected ? t('vl_deselect') : t('vl_select')}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelection(item);
            }}
            sx={{ position: 'absolute', right: 78, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#fff' } }}
          >
            {selected ? <CheckCircleIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
          </IconButton>
        )}

        {(isFinePointer || !swipeEnabled) && !readOnly && (
          <IconButton
            className="vl-row-action"
            size="small"
            color="warning"
            aria-label={t('product_reserve_submit')}
            onClick={(event) => {
              event.stopPropagation();
              onAction('reserve', item);
            }}
            sx={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#fff' } }}
          >
            <EventAvailableIcon fontSize="small" />
          </IconButton>
        )}

        {(isFinePointer || !swipeEnabled) && !readOnly && (
          <IconButton
            className="vl-row-action"
            size="small"
            color={inCart ? 'error' : 'primary'}
            disabled={unavailable}
            aria-label={inCart ? t('vl_cart_remove') : t('cart_add')}
            onClick={(event) => {
              event.stopPropagation();
              onAction('cart', item);
            }}
            sx={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.1)', '&:hover': { bgcolor: '#fff' } }}
          >
            {inCart ? <ShoppingCartIcon fontSize="small" /> : <AddShoppingCartIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

export default function VlList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useI18n();
  const isFinePointer = useMediaQuery('(pointer: fine)');
  const initialReturnState = location.state?.vlReturnState || null;

  const [viewMode, setViewMode] = React.useState(() => initialReturnState?.viewMode === 'grouped' ? 'grouped' : 'classic');
  const [vlMandants, setVlMandants] = React.useState([]);
  const [vlMandantId, setVlMandantId] = React.useState(() => String(initialReturnState?.vlMandantId || ''));
  const [vlMandantsLoaded, setVlMandantsLoaded] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(() => Boolean(initialReturnState?.searchOpen || initialReturnState?.searchInput));
  const [searchInput, setSearchInput] = React.useState(() => String(initialReturnState?.searchInput || ''));
  const [classicItems, setClassicItems] = React.useState([]);
  const [groupedGroups, setGroupedGroups] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [initialLoaded, setInitialLoaded] = React.useState(false);
  const [revealedRow, setRevealedRow] = React.useState({ id: '', side: '' });
  const [expandedGroups, setExpandedGroups] = React.useState(() => initialReturnState?.expandedGroups || {});
  const [selectedItems, setSelectedItems] = React.useState(() => (
    Array.isArray(initialReturnState?.selectedItems) ? initialReturnState.selectedItems : []
  ));
  const [cartItems, setCartItems] = React.useState(() => getOrderCartItems());
  const [batchCartItems, setBatchCartItems] = React.useState([]);
  const [batchCartScope, setBatchCartScope] = React.useState('grouped');
  const [batchCartOpen, setBatchCartOpen] = React.useState(false);
  const [batchCartError, setBatchCartError] = React.useState('');
  const [batchCartSuccess, setBatchCartSuccess] = React.useState('');
  const [batchCartSettings, setBatchCartSettings] = React.useState({});
  const [batchCartGlobalSettings, setBatchCartGlobalSettings] = React.useState({
    salePrice: '',
    deliveryDate: tomorrow(),
    wpzOriginal: true,
    wpzComment: 'Original verwenden',
  });
  const [batchCartQuantities, setBatchCartQuantities] = React.useState({});
  const [batchCartWpzIds, setBatchCartWpzIds] = React.useState({});
  const [batchCartWpzLoading, setBatchCartWpzLoading] = React.useState(false);
  const [customerRequiredOpen, setCustomerRequiredOpen] = React.useState(false);
  const [pendingCustomerAction, setPendingCustomerAction] = React.useState(null);

  const sentinelRef = React.useRef(null);
  const listRef = React.useRef(null);
  const loadingRef = React.useRef(false);
  const wpzRequestRef = React.useRef(0);
  const restorationRef = React.useRef(initialReturnState);
  const normalizedSearch = String(searchInput || '').trim();
  const effectiveQuery = normalizedSearch.length >= 2 ? normalizedSearch : '';
  const visibleItemCount = viewMode === 'grouped' ? groupedGroups.length : classicItems.length;
  const hasMore = visibleItemCount < total;
  const activeMandantName = getMandant().trim().toLowerCase();
  const activeVlMandantId = vlMandants.find((mandant) => mandant.name.toLowerCase() === activeMandantName)?.id;
  const isForeignVl = Boolean(
    vlMandantId
    && activeVlMandantId !== undefined
    && String(vlMandantId) !== String(activeVlMandantId),
  );
  const cartIds = React.useMemo(
    () => new Set(cartItems.map((item) => getItemId(item))),
    [cartItems],
  );
  const batchCartGroups = React.useMemo(
    () => buildSelectedGroups(batchCartItems, lang),
    [batchCartItems, lang],
  );
  React.useEffect(() => {
    const syncCart = () => setCartItems(getOrderCartItems());
    window.addEventListener(ORDER_CART_CHANGED, syncCart);
    window.addEventListener('storage', syncCart);
    syncCart();
    return () => {
      window.removeEventListener(ORDER_CART_CHANGED, syncCart);
      window.removeEventListener('storage', syncCart);
    };
  }, []);

  React.useEffect(() => {
    if (!isForeignVl) return;
    setSelectedItems([]);
    setBatchCartItems([]);
    setBatchCartOpen(false);
  }, [isForeignVl]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mandantsResponse, meResponse] = await Promise.all([
          apiRequest('/mandants'),
          apiRequest('/me'),
        ]);
        if (!alive) return;
        const options = getSelectableMandants(mandantsResponse?.data, meResponse)
          .filter((mandant) => mandant.id !== null);
        setVlMandants(options);
        const requestedId = String(initialReturnState?.vlMandantId || '');
        const activeName = getMandant().trim().toLowerCase();
        const selected = options.find((mandant) => String(mandant.id) === requestedId)
          || options.find((mandant) => mandant.name.toLowerCase() === activeName);
        setVlMandantId(selected ? String(selected.id) : '');
      } catch {
        if (alive) setVlMandants([]);
      } finally {
        if (alive) setVlMandantsLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const getVlReturnState = React.useCallback(() => ({
    viewMode,
    vlMandantId,
    searchOpen,
    searchInput,
    page: Math.max(Number(page) || 1, 1),
    scrollTop: Number(listRef.current?.scrollTop || 0),
    expandedGroups,
    selectedItems,
  }), [expandedGroups, page, searchInput, searchOpen, selectedItems, viewMode, vlMandantId]);

  const loadPage = React.useCallback(async (nextPage, query, replace) => {
    if (!vlMandantsLoaded) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(viewMode === 'grouped' ? GROUP_PAGE_SIZE : PAGE_SIZE),
        sort: 'vl',
        dir: 'ASC',
      });
      if (query) params.set('q', query);
      if (vlMandantId) params.set('vlMandantId', vlMandantId);
      const endpoint = viewMode === 'grouped' ? '/products/grouped' : '/products';
      const res = await apiRequest(`${endpoint}?${params.toString()}`);
      const data = Array.isArray(res?.data) ? res.data : [];
      const nextTotal = Number(res?.meta?.totalGroups ?? res?.meta?.total ?? 0);
      if (viewMode === 'grouped') setGroupedGroups((previous) => (replace ? data : [...previous, ...data]));
      else setClassicItems((previous) => (replace ? data : [...previous, ...data]));
      setPage(nextPage);
      setTotal(nextTotal);
      setInitialLoaded(true);
      setRevealedRow({ id: '', side: '' });
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [t, viewMode, vlMandantId, vlMandantsLoaded]);

  const loadNextPage = React.useCallback(async () => {
    if (loadingRef.current) return;
    if (initialLoaded && !hasMore) return;
    await loadPage(page + 1, effectiveQuery, false);
  }, [effectiveQuery, hasMore, initialLoaded, loadPage, page]);

  React.useEffect(() => {
    if (!vlMandantsLoaded) return undefined;
    const returnState = restorationRef.current;
    if (returnState) {
      restorationRef.current = null;
      setClassicItems([]);
      setGroupedGroups([]);
      setPage(0);
      setTotal(0);
      setInitialLoaded(false);
      setRevealedRow({ id: '', side: '' });
      const targetPage = Math.max(Number(returnState.page) || 1, 1);
      const restorePages = async () => {
        for (let restorePage = 1; restorePage <= targetPage; restorePage += 1) {
          await loadPage(restorePage, effectiveQuery, restorePage === 1);
        }
        window.requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = Math.max(Number(returnState.scrollTop) || 0, 0);
        });
        navigate(location.pathname, { replace: true, state: null });
      };
      void restorePages();
      return;
    }
    setClassicItems([]);
    setGroupedGroups([]);
    setPage(0);
    setTotal(0);
    setInitialLoaded(false);
    setExpandedGroups({});
    setRevealedRow({ id: '', side: '' });
    if (listRef.current) listRef.current.scrollTop = 0;
    void loadPage(1, effectiveQuery, true);
  }, [effectiveQuery, loadPage, location.pathname, navigate, vlMandantId, vlMandantsLoaded]);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadNextPage();
    }, { root: listRef.current, rootMargin: '250px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNextPage]);

  const toggleSelection = React.useCallback((item) => {
    const itemId = getItemId(item);
    if (!itemId) return;
    setSelectedItems((previous) => {
      if (previous.some((entry) => getItemId(entry) === itemId)) {
        return previous.filter((entry) => getItemId(entry) !== itemId);
      }
      if (getAvailableAmount(item) <= 0) return previous;
      const group = getGroupInfo(item, lang);
      return [...previous, { ...item, groupKey: group.key, groupName: group.name }];
    });
    setBatchCartSuccess('');
  }, [lang]);

  const setGroupSelection = React.useCallback((positions, selected) => {
    const entries = Array.isArray(positions) ? positions : [];
    setSelectedItems((previous) => {
      const next = new Map(previous.map((item) => [getItemId(item), item]));
      entries.forEach((item) => {
        const id = getItemId(item);
        if (!id) return;
        if (selected) {
          if (getAvailableAmount(item) <= 0) return;
          const group = getGroupInfo(item, lang);
          next.set(id, { ...item, groupKey: group.key, groupName: group.name });
        } else {
          next.delete(id);
        }
      });
      return Array.from(next.values());
    });
    setBatchCartSuccess('');
  }, [lang]);

  const removeSelectedItem = React.useCallback((itemId) => {
    const key = String(itemId || '');
    setSelectedItems((previous) => previous.filter((item) => getItemId(item) !== key));
    setBatchCartItems((previous) => previous.filter((item) => getItemId(item) !== key));
    setBatchCartSuccess('');
  }, []);

  const openBatchCartDialog = React.useCallback(async (itemsOverride = null, scope = 'grouped') => {
    if (isForeignVl) return;
    const sourceItems = (Array.isArray(itemsOverride) ? itemsOverride : selectedItems)
      .filter((item) => !cartIds.has(getItemId(item)) && getAvailableAmount(item) > 0);
    if (!sourceItems.length) return;
    const normalizedScope = scope === 'classic' ? 'classic' : 'grouped';
    const quantities = {};
    sourceItems.forEach((item) => {
      quantities[getItemId(item)] = String(getAvailableAmount(item));
    });
    const settings = {};
    buildSelectedGroups(sourceItems, lang).forEach((group) => {
      settings[group.key] = {
        salePrice: '',
        deliveryDate: tomorrow(),
        wpzOriginal: true,
        wpzComment: 'Original verwenden',
      };
    });
    setBatchCartItems(sourceItems);
    setBatchCartScope(normalizedScope);
    setBatchCartQuantities(quantities);
    setBatchCartSettings(settings);
    setBatchCartGlobalSettings({
      salePrice: '',
      deliveryDate: tomorrow(),
      wpzOriginal: true,
      wpzComment: 'Original verwenden',
    });
    setBatchCartError('');
    setBatchCartWpzIds({});
    setBatchCartOpen(true);
    setBatchCartWpzLoading(true);
    const requestId = wpzRequestRef.current + 1;
    wpzRequestRef.current = requestId;
    const wpzEntries = await Promise.all(sourceItems.map(async (item) => {
      const key = getItemId(item);
      try {
        const sourceQuery = vlMandantId ? `?vlMandantId=${encodeURIComponent(vlMandantId)}` : '';
        const response = await apiRequest(`/products/${encodeURIComponent(key)}/wpz${sourceQuery}`);
        const wpzId = Number(response?.data?.wpzId);
        return [key, Number.isFinite(wpzId) && wpzId > 0 ? wpzId : null];
      } catch {
        return [key, null];
      }
    }));
    if (wpzRequestRef.current !== requestId) return;
    setBatchCartWpzIds(Object.fromEntries(wpzEntries));
    setBatchCartWpzLoading(false);
  }, [cartIds, isForeignVl, lang, selectedItems, vlMandantId]);

  const getAddableSelectedItems = React.useCallback((item) => {
    const itemId = getItemId(item);
    const itemIsSelected = selectedItems.some((entry) => getItemId(entry) === itemId);
    if (!itemIsSelected) return [item];
    return selectedItems.filter((entry) => !cartIds.has(getItemId(entry)));
  }, [cartIds, selectedItems]);

  const requestProductAction = React.useCallback((action, item) => {
    if (isForeignVl) return;
    const vlReturnState = getVlReturnState();
    const itemId = getItemId(item);
    if (action === 'cart' && cartIds.has(itemId)) {
      removeOrderCartItem(itemId);
      setCartItems(getOrderCartItems());
      setSelectedItems((previous) => previous.filter((entry) => getItemId(entry) !== itemId));
      setBatchCartSuccess('');
      return;
    }
    const sourceItems = action === 'cart' ? getAddableSelectedItems(item) : null;
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction(action === 'cart'
        ? { type: 'batchCart', items: sourceItems, scope: viewMode === 'classic' ? 'classic' : 'grouped' }
        : { type: action, product: item, vlReturnState });
      setCustomerRequiredOpen(true);
      return;
    }
    if (action === 'reserve') navigate('/orders/new', { state: { source: item, fromVl: true, vlMandantId, vlReturnState } });
    else if (action === 'cart') void openBatchCartDialog(sourceItems, viewMode === 'classic' ? 'classic' : 'grouped');
  }, [cartIds, getAddableSelectedItems, getVlReturnState, isForeignVl, navigate, openBatchCartDialog, viewMode, vlMandantId]);

  const requestBatchCart = React.useCallback(() => {
    if (isForeignVl) return;
    const sourceItems = selectedItems.filter((item) => !cartIds.has(getItemId(item)));
    if (!sourceItems.length) return;
    const scope = viewMode === 'classic' ? 'classic' : 'grouped';
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction({ type: 'batchCart', items: sourceItems, scope });
      setCustomerRequiredOpen(true);
      return;
    }
    void openBatchCartDialog(sourceItems, scope);
  }, [cartIds, getSelectedCustomer, isForeignVl, openBatchCartDialog, selectedItems, viewMode]);

  const chooseCustomer = React.useCallback(() => {
    if (!pendingCustomerAction) return;
    setCustomerRequiredOpen(false);
    navigate('/customers', {
      state: {
        afterSelect: {
          to: '/vl',
          state: { pendingCustomerAction },
        },
      },
    });
  }, [navigate, pendingCustomerAction]);

  React.useEffect(() => {
    const pending = location.state?.pendingCustomerAction;
    if (isForeignVl || !pending || !getSelectedCustomer()?.id) return;
    const nextState = { ...(location.state || {}) };
    delete nextState.pendingCustomerAction;
    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });
    if (pending.type === 'batchCart' && Array.isArray(pending.items)) {
      setSelectedItems(pending.items);
      void openBatchCartDialog(pending.items, pending.scope || 'grouped');
    } else if (pending.type === 'reserve' && pending.product) {
      navigate('/orders/new', { state: { source: pending.product, fromVl: true, vlMandantId, vlReturnState: pending.vlReturnState || null } });
    } else if (pending.type === 'cart' && pending.product) {
      void openBatchCartDialog([pending.product], 'classic');
    }
  }, [isForeignVl, location.pathname, location.state, navigate, openBatchCartDialog, vlMandantId]);

  const addSelectedPositionsToCart = React.useCallback(() => {
    if (isForeignVl) return;
    if (!batchCartItems.length) return;
    if (batchCartWpzLoading) {
      setBatchCartError(t('vl_batch_waiting_for_wpz'));
      return;
    }
    if (batchCartScope === 'classic') {
      const salePrice = Number(batchCartGlobalSettings.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        setBatchCartError(t('validation_sale_price_positive'));
        return;
      }
      if (!String(batchCartGlobalSettings.deliveryDate || '').trim()) {
        setBatchCartError(t('validation_delivery_date_required'));
        return;
      }
    }
    for (const group of batchCartGroups) {
      const settings = batchCartScope === 'classic'
        ? batchCartGlobalSettings
        : (batchCartSettings[group.key] || {});
      if (batchCartScope !== 'classic') {
        const salePrice = Number(settings.salePrice);
        if (!Number.isFinite(salePrice) || salePrice <= 0) {
          setBatchCartError(`${group.name}: ${t('validation_sale_price_positive')}`);
          return;
        }
        if (!String(settings.deliveryDate || '').trim()) {
          setBatchCartError(`${group.name}: ${t('validation_delivery_date_required')}`);
          return;
        }
      }
      for (const item of group.items) {
        const quantity = Number(batchCartQuantities[getItemId(item)]);
        const available = getAvailableAmount(item);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          setBatchCartError(`${item.article || item.beNumber}: ${t('validation_cart_quantity_positive')}`);
          return;
        }
        if (quantity > available) {
          setBatchCartError(`${item.article || item.beNumber}: ${t('validation_cart_quantity_not_above_available')}`);
          return;
        }
      }
    }

    const selectedIds = new Set(batchCartItems.map((item) => getItemId(item)));
    batchCartGroups.forEach((group) => {
      const settings = batchCartScope === 'classic'
        ? batchCartGlobalSettings
        : (batchCartSettings[group.key] || {});
      group.items.forEach((item) => {
        const id = getItemId(item);
        const wpzId = batchCartWpzIds[id] || null;
        addOrderCartItem({
          ...item,
          id,
          storageId: item.storageId || item.warehouseId,
          salePrice: Number(settings.salePrice),
          deliveryDate: settings.deliveryDate,
          wpzId,
          wpzOriginal: wpzId ? Boolean(settings.wpzOriginal) : null,
          wpzComment: settings.wpzComment || 'Original verwenden',
        }, Number(batchCartQuantities[id]));
      });
    });
    setSelectedItems((previous) => previous.filter((item) => !selectedIds.has(getItemId(item))));
    setBatchCartItems([]);
    setBatchCartOpen(false);
    setBatchCartError('');
    setBatchCartSuccess(t('vl_batch_success', {
      count: batchCartItems.length,
      positionLabel: getPositionLabel(batchCartItems.length, t),
    }));
    setRevealedRow({ id: '', side: '' });
  }, [batchCartGlobalSettings, batchCartGroups, batchCartItems, batchCartQuantities, batchCartScope, batchCartSettings, batchCartWpzIds, batchCartWpzLoading, isForeignVl, t]);

  const handleAction = React.useCallback((action, item) => {
    setRevealedRow({ id: '', side: '' });
    if (action === 'select') toggleSelection(item);
    else requestProductAction(action, item);
  }, [requestProductAction, toggleSelection]);

  const handleRowTap = React.useCallback((itemId) => {
    if (revealedRow.id && String(revealedRow.id) === String(itemId)) {
      setRevealedRow({ id: '', side: '' });
      return;
    }
    navigate(`/products/${encodeURIComponent(itemId)}`, { state: { fromVl: true, vlMandantId, vlReadOnly: isForeignVl, vlReturnState: getVlReturnState() } });
  }, [getVlReturnState, isForeignVl, navigate, revealedRow, vlMandantId]);

  const toggleGroup = React.useCallback((groupKey) => {
    setExpandedGroups((previous) => ({ ...previous, [groupKey]: previous[groupKey] !== true }));
  }, []);

  const handleVlMandantChange = React.useCallback((event) => {
    const nextId = String(event.target.value || '');
    if (nextId === vlMandantId) return;
    restorationRef.current = null;
    setVlMandantId(nextId);
    setSelectedItems([]);
    setBatchCartItems([]);
    setBatchCartOpen(false);
    setBatchCartSuccess('');
    setPendingCustomerAction(null);
    setCustomerRequiredOpen(false);
    setClassicItems([]);
    setGroupedGroups([]);
    setPage(0);
    setTotal(0);
    setInitialLoaded(false);
    setExpandedGroups({});
    setRevealedRow({ id: '', side: '' });
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [vlMandantId]);

  const renderGrouped = () => groupedGroups.map((group, groupIndex) => {
    const positions = Array.isArray(group.positions) ? group.positions : [];
    const selectablePositions = positions.filter((item) => getAvailableAmount(item) > 0);
    const selectedInGroup = positions.filter((item) => selectedItems.some((entry) => getItemId(entry) === getItemId(item)));
    const allSelected = selectablePositions.length > 0
      && selectablePositions.every((item) => selectedItems.some((entry) => getItemId(entry) === getItemId(item)));
    const isExpanded = Boolean(effectiveQuery) || expandedGroups[group.key] === true;
    return (
      <Box key={group.key} sx={{ display: 'grid', gap: 0.45 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: groupIndex ? 0.45 : 0, minWidth: 0, cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onClick={() => toggleGroup(group.key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleGroup(group.key);
            }
          }}
        >
          <IconButton
            size="small"
            aria-label={isExpanded ? t('vl_group_collapse') : t('vl_group_expand')}
            aria-expanded={isExpanded}
            onClick={(event) => {
              event.stopPropagation();
              toggleGroup(group.key);
            }}
            sx={{ p: 0.25, color: 'text.secondary' }}
          >
            <ChevronRightIcon fontSize="small" sx={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }} />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 600 }}>{group.name || '-'}</Typography>
            <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
              {t('vl_available_count', { count: positions.length, positionLabel: getPositionLabel(positions.length, t) })}
            </Typography>
            {!isForeignVl && selectedInGroup.length > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('vl_selected_short', { count: selectedInGroup.length })}
              </Typography>
            )}
          </Box>
        </Box>

        {isExpanded && (
          <Box sx={{ display: 'grid', gap: 0.6, pl: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t('vl_available_heading')}</Typography>
              {!isForeignVl && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Button size="small" disabled={selectablePositions.length === 0} onClick={() => setGroupSelection(positions, !allSelected)}>
                    {allSelected ? t('vl_clear_selection') : t('vl_select_all')}
                  </Button>
                  <IconButton
                    size="small"
                    color="primary"
                    aria-label={t('vl_batch_add_selected')}
                    title={t('vl_batch_add_selected')}
                    disabled={selectedItems.length === 0}
                    onClick={requestBatchCart}
                  >
                    <ShoppingCartIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>
            {positions.map((item, index) => (
              <SwipeableProductRow
                key={getItemId(item)}
                item={item}
                selected={selectedItems.some((entry) => getItemId(entry) === getItemId(item))}
                variant="grouped"
                index={index}
                isFinePointer={isFinePointer}
                revealedRow={revealedRow}
                onReveal={(id, side) => setRevealedRow({ id, side })}
                onToggleSelection={toggleSelection}
                onTap={handleRowTap}
                onAction={handleAction}
                onDetails={(id) => navigate(`/products/${encodeURIComponent(id)}`, { state: { fromVl: true, vlMandantId, vlReadOnly: isForeignVl, vlReturnState: getVlReturnState() } })}
                onEmployeeClick={(shortCode) => navigate(`/employees/${encodeURIComponent(shortCode)}`)}
                inCart={!isForeignVl && cartIds.has(getItemId(item))}
                readOnly={isForeignVl}
                t={t}
              />
            ))}
          </Box>
        )}
      </Box>
    );
  });

  let lastClassicGroup = '';
  const renderClassic = () => classicItems.map((item, index) => {
    const group = buildGroupTitle(item, lang);
    const showHeader = group !== lastClassicGroup;
    if (showHeader) lastClassicGroup = group;
    return (
      <Box key={getItemId(item)} sx={{ mb: 0.4 }}>
        {showHeader && <Typography variant="subtitle2" sx={{ mt: 1.2, mb: 0.35, fontWeight: 700 }}>{group}</Typography>}
        <SwipeableProductRow
          item={item}
          selected={selectedItems.some((entry) => getItemId(entry) === getItemId(item))}
          variant="classic"
          index={index}
          isFinePointer={isFinePointer}
          revealedRow={revealedRow}
          onReveal={(id, side) => setRevealedRow({ id, side })}
          onToggleSelection={toggleSelection}
          onTap={handleRowTap}
          onAction={handleAction}
          onDetails={(id) => navigate(`/products/${encodeURIComponent(id)}`, { state: { fromVl: true, vlMandantId, vlReadOnly: isForeignVl, vlReturnState: getVlReturnState() } })}
          onEmployeeClick={(shortCode) => navigate(`/employees/${encodeURIComponent(shortCode)}`)}
          inCart={!isForeignVl && cartIds.has(getItemId(item))}
          readOnly={isForeignVl}
          t={t}
        />
      </Box>
    );
  });

  const renderBatchItem = (item, salePrice) => {
    const id = getItemId(item);
    return (
      <Card key={id} variant="outlined">
        <CardContent sx={{ display: 'grid', gap: 0.6, py: '8px !important', px: '10px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.article || '-'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {`${item.warehouse || item.warehouseId || '-'} Â· ${t('product_be_number')}: ${item.beNumber || '-'} Â· ${t('product_available_now')}: ${formatQuantity(getAvailableAmount(item))} ${item.unit || 'kg'}`}
              </Typography>
            </Box>
            <IconButton size="small" color="error" aria-label={t('vl_remove_selected')} title={t('vl_remove_selected')} onClick={() => removeSelectedItem(id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
          <TextField
            type="number"
            label={t('vl_batch_quantity')}
            value={batchCartQuantities[id] ?? ''}
            onChange={(event) => setBatchCartQuantities((previous) => ({ ...previous, [id]: event.target.value }))}
            inputProps={{ min: 1, max: getAvailableAmount(item), step: 'any' }}
            size="small"
            fullWidth
          />
          <SaleMarginHint salePrice={salePrice} costPrice={item.acquisitionPrice} />
        </CardContent>
      </Card>
    );
  };

  const selectedCount = selectedItems.length;
  const batchCartCount = batchCartItems.length;

  return (
    <Box sx={{ maxWidth: 980, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          flexShrink: 0,
          bgcolor: 'background.default',
          pt: 0.25,
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, minWidth: 0 }}>
          <Typography variant="h5">{t('vl_title')}</Typography>
          <IconButton
            aria-label="vl-search-toggle"
            onClick={() => {
              if (searchOpen) {
                setSearchInput('');
                setSearchOpen(false);
              } else setSearchOpen(true);
            }}
          >
            <SearchIcon />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', pb: 0.25 }}>
          <RadioGroup
            row
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value === 'classic' ? 'classic' : 'grouped')}
            sx={{ flexWrap: 'nowrap', gap: 0.25, flexShrink: 0, '& .MuiFormControlLabel-root': { margin: 0 }, '& .MuiFormControlLabel-label': { fontSize: '0.78rem', whiteSpace: 'nowrap' } }}
          >
            <FormControlLabel value="classic" control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />} label={t('vl_view_classic')} />
            <FormControlLabel value="grouped" control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />} label={t('vl_view_grouped')} />
          </RadioGroup>
          {!isForeignVl && selectedCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 'auto' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('vl_selected', { count: selectedCount })}</Typography>
              <IconButton size="small" color="primary" aria-label={t('vl_batch_add_selected')} title={t('vl_batch_add_selected')} onClick={requestBatchCart}>
                <ShoppingCartIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          <TextField
            select
            size="small"
            label={t('vl_mandant_label')}
            value={vlMandantId}
            onChange={handleVlMandantChange}
            disabled={!vlMandantsLoaded || vlMandants.length === 0}
            sx={{ minWidth: 150, ml: selectedCount > 0 ? 0 : 'auto', flexShrink: 0 }}
            SelectProps={{ MenuProps: { PaperProps: { style: { maxHeight: 320 } } } }}
          >
            {vlMandants.map((mandant) => (
              <MenuItem key={mandant.id} value={String(mandant.id)}>{mandant.name}</MenuItem>
            ))}
          </TextField>
        </Box>

        {searchOpen && (
          <TextField
            fullWidth
            size="small"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            autoFocus
            placeholder={t('vl_search')}
            sx={{ mt: 0.75 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ opacity: 0.65 }} /></InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="clear-search" onClick={() => setSearchInput('')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      </Box>

      <Box ref={listRef} sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', pr: 0.25 }}>
        {error && <Alert severity="error" sx={{ mt: 1, mb: 1.25 }}>{error}</Alert>}
        {batchCartSuccess && <Alert severity="success" sx={{ mt: 1, mb: 1.25 }}>{batchCartSuccess}</Alert>}
        {!loading && initialLoaded && visibleItemCount === 0 && <Typography sx={{ opacity: 0.7, mt: 1 }}>{t('vl_empty')}</Typography>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, mt: 0.5 }}>
          {viewMode === 'grouped' ? renderGrouped() : renderClassic()}
        </Box>
        <Box ref={sentinelRef} sx={{ height: 18 }} />
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
            <CircularProgress size={22} />
          </Box>
        )}
      </Box>

      <Dialog open={batchCartOpen && batchCartScope === 'classic'} onClose={() => setBatchCartOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {t('vl_batch_title', { count: batchCartCount, positionLabel: getPositionLabel(batchCartCount, t) })}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          {batchCartError && <Alert severity="error">{batchCartError}</Alert>}
          {batchCartWpzLoading && <CircularProgress size={20} />}
          <TextField
            type="number"
            label={t('vl_batch_global_price_all')}
            value={batchCartGlobalSettings.salePrice || ''}
            onChange={(event) => setBatchCartGlobalSettings((previous) => ({ ...previous, salePrice: event.target.value }))}
            inputProps={{ min: 0.01, step: 'any' }}
            fullWidth
            required
          />
          <TextField
            type="date"
            label={t('vl_batch_global_date_all')}
            value={batchCartGlobalSettings.deliveryDate || ''}
            onChange={(event) => setBatchCartGlobalSettings((previous) => ({ ...previous, deliveryDate: event.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
          />
          {(() => {
            const firstWpzId = batchCartItems.map((item) => batchCartWpzIds[getItemId(item)]).find(Boolean) || null;
            return !batchCartWpzLoading && firstWpzId ? (
              <WpzCommentField
                wpzId={firstWpzId}
                wpzOriginal={Boolean(batchCartGlobalSettings.wpzOriginal)}
                wpzComment={batchCartGlobalSettings.wpzComment || 'Original verwenden'}
                onChange={({ wpzOriginal, wpzComment }) => setBatchCartGlobalSettings((previous) => ({ ...previous, wpzOriginal, wpzComment }))}
              />
            ) : !batchCartWpzLoading ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('vl_batch_wpz_none_all')}</Typography>
            ) : null;
          })()}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('vl_batch_quantity_hint')}</Typography>
          <Box sx={{ display: 'grid', gap: 0.75 }}>
            {batchCartItems.map((item) => renderBatchItem(item, batchCartGlobalSettings.salePrice))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchCartOpen(false)}>{t('back_label')}</Button>
          <Button variant="contained" onClick={addSelectedPositionsToCart} disabled={batchCartWpzLoading || batchCartCount === 0}>{t('vl_batch_add_selected')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={batchCartOpen && batchCartScope !== 'classic'} onClose={() => setBatchCartOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {t('vl_batch_title', { count: batchCartCount, positionLabel: getPositionLabel(batchCartCount, t) })}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          {batchCartError && <Alert severity="error">{batchCartError}</Alert>}
          {batchCartWpzLoading && <CircularProgress size={20} />}
          {batchCartGroups.map((group) => {
            const settings = batchCartSettings[group.key] || {};
            const firstWpzId = group.items.map((item) => batchCartWpzIds[getItemId(item)]).find(Boolean) || null;
            return (
              <Box key={group.key} sx={{ display: 'grid', gap: 0.8 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{group.name}</Typography>
                <TextField
                  type="number"
                  label={t('vl_batch_global_price')}
                  value={settings.salePrice || ''}
                  onChange={(event) => setBatchCartSettings((previous) => ({ ...previous, [group.key]: { ...settings, salePrice: event.target.value } }))}
                  inputProps={{ min: 0.01, step: 'any' }}
                  fullWidth
                  required
                />
                <TextField
                  type="date"
                  label={t('vl_batch_global_date')}
                  value={settings.deliveryDate || ''}
                  onChange={(event) => setBatchCartSettings((previous) => ({ ...previous, [group.key]: { ...settings, deliveryDate: event.target.value } }))}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  required
                />
                {!batchCartWpzLoading && firstWpzId ? (
                  <WpzCommentField
                    wpzId={firstWpzId}
                    wpzOriginal={Boolean(settings.wpzOriginal)}
                    wpzComment={settings.wpzComment || 'Original verwenden'}
                    onChange={({ wpzOriginal, wpzComment }) => setBatchCartSettings((previous) => ({ ...previous, [group.key]: { ...settings, wpzOriginal, wpzComment } }))}
                  />
                ) : !batchCartWpzLoading ? (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('vl_batch_wpz_none')}</Typography>
                ) : null}
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('vl_batch_quantity_hint')}</Typography>
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {group.items.map((item) => {
                    const id = getItemId(item);
                    return (
                      <Card key={id} variant="outlined">
                        <CardContent sx={{ display: 'grid', gap: 0.6, py: '8px !important', px: '10px !important' }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.article || '-'}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                {`${item.warehouse || item.warehouseId || '-'} · ${t('product_be_number')}: ${item.beNumber || '-'} · ${t('product_available_now')}: ${formatQuantity(getAvailableAmount(item))} ${item.unit || 'kg'}`}
                              </Typography>
                            </Box>
                            <IconButton size="small" color="error" aria-label={t('vl_remove_selected')} title={t('vl_remove_selected')} onClick={() => removeSelectedItem(id)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          <TextField
                            type="number"
                            label={t('vl_batch_quantity')}
                            value={batchCartQuantities[id] ?? ''}
                            onChange={(event) => setBatchCartQuantities((previous) => ({ ...previous, [id]: event.target.value }))}
                            inputProps={{ min: 1, max: getAvailableAmount(item), step: 'any' }}
                            size="small"
                            fullWidth
                          />
                          <SaleMarginHint salePrice={settings.salePrice} costPrice={item.acquisitionPrice} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchCartOpen(false)}>{t('back_label')}</Button>
          <Button variant="contained" onClick={addSelectedPositionsToCart} disabled={batchCartWpzLoading || batchCartCount === 0}>{t('vl_batch_add_selected')}</Button>
        </DialogActions>
      </Dialog>

      <CustomerRequiredDialog open={customerRequiredOpen} onClose={() => setCustomerRequiredOpen(false)} onChoose={chooseCustomer} />
    </Box>
  );
}

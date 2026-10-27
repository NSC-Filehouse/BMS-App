import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo, navigateToReturn } from '../utils/navigation.js';
import { createVlReturnTo } from '../utils/vlNavigation.js';
import { getMandant } from '../utils/mandant.js';
import { getSelectableMandants } from '../utils/mandantOptions.js';
import {
  getOrderCartItems,
  ORDER_CART_CHANGED,
  removeOrderCartProduct,
} from '../utils/orderCart.js';
import { addProductsToOrderCart } from '../utils/orderCartProducts.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import CustomerRequiredDialog from '../components/CustomerRequiredDialog.jsx';
import TempPlanningHint from '../components/TempPlanningHint.jsx';
import OptionVlRow from '../components/OptionVlRow.jsx';
import { formatMfiValue, sortVlItems } from '../utils/mfi.js';
import { formatSearchCondition, formatSearchMatch } from '../utils/productSearch.js';
import {
  FRUPACK_GROUP_SCOPE, getVlPositionKey, isVlPositionReadOnly, getProductSourceMandantId,
  isVlReturnStateForMandant, resolveInitialVlSelection, buildVlDropdownOptions,
} from '../utils/vlScope.js';

const PAGE_SIZE = 100;
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
  const mfi = formatMfiValue(mfiValue);
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

function SwipeableProductRow({
  item,
  selected,
  index,
  isFinePointer,
  revealedRow,
  onReveal,
  onToggleSelection,
  onTap,
  onAction,
  onEmployeeClick,
  inCart,
  readOnly,
  foreign,
  showSource,
  lang,
  t,
}) {
  const rowId = getVlPositionKey(item);
  // VL actions are intentionally direct; horizontal swipe is disabled.
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
    onTap(item);
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
    px: 0.75,
    py: 0.45,
    borderRadius: 0.5,
    cursor: 'pointer',
    borderColor: inCart ? 'success.main' : (selected ? 'success.light' : 'divider'),
    backgroundColor: foreign ? '#E3F2FD' : inCart
      ? '#C8E6C9'
      : (selected
        ? '#E8F5E9'
        : (index % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent')),
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    lineHeight: 1.35,
    pr: readOnly ? 0.75 : 9.5,
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
        {showSource && (
          <Typography variant="caption" sx={{ display: 'block', pt: 0.35, pb: 0.15, color: foreign ? '#1565C0' : 'text.secondary' }}>
            {item.sourceMandantName}
          </Typography>
        )}
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
            </Typography>
            {parts.remark && (
              <Box sx={{ mt: 0.2, minWidth: 0 }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.2 }}>
                  {t('product_vl_remark')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {parts.remark}
                </Typography>
              </Box>
            )}
            <TempPlanningHint item={item} onEmployeeClick={onEmployeeClick} t={t} />
            {item.searchMatch && (item.searchMatch.matches.length > 0 || item.searchMatch.fuzzy.length > 0) && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {formatSearchMatch(item.searchMatch, t, lang)}
              </Typography>
            )}
          </Box>
        </Box>

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
  const activeMandantName = getMandant().trim().toLowerCase();
  const initialReturnState = isVlReturnStateForMandant(location.state?.vlReturnState, activeMandantName)
    ? location.state.vlReturnState : null;

  const [vlMandants, setVlMandants] = React.useState([]);
  const [frupackMandantIds, setFrupackMandantIds] = React.useState([]);
  const [canViewFrupackGroup, setCanViewFrupackGroup] = React.useState(false);
  const [optionsPreview, setOptionsPreview] = React.useState(false);
  const [groupSourceNames, setGroupSourceNames] = React.useState([]);
  const [vlMandantId, setVlMandantId] = React.useState(() => String(initialReturnState?.vlMandantId || ''));
  const [vlMandantsLoaded, setVlMandantsLoaded] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(() => String(initialReturnState?.searchInput || ''));
  const [debouncedSearch, setDebouncedSearch] = React.useState(() => String(initialReturnState?.searchInput || '').trim());
  const [searchMeta, setSearchMeta] = React.useState(null);
  const [classicItems, setClassicItems] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [initialLoaded, setInitialLoaded] = React.useState(false);
  const [revealedRow, setRevealedRow] = React.useState({ id: '', side: '' });
  const [selectedItems, setSelectedItems] = React.useState(() => (
    Array.isArray(initialReturnState?.selectedItems) ? initialReturnState.selectedItems : []
  ));
  const [cartItems, setCartItems] = React.useState(() => getOrderCartItems());
  const [batchCartError, setBatchCartError] = React.useState('');
  const [batchCartSuccess, setBatchCartSuccess] = React.useState('');
  const [batchCartAdding, setBatchCartAdding] = React.useState(false);
  const [customerRequiredOpen, setCustomerRequiredOpen] = React.useState(false);
  const [pendingCustomerAction, setPendingCustomerAction] = React.useState(null);

  const sentinelRef = React.useRef(null);
  const listRef = React.useRef(null);
  const locationRef = React.useRef(location);
  locationRef.current = location;
  const cartAddingRef = React.useRef(false);
  const loadingRef = React.useRef(false);
  const activeRequestRef = React.useRef(null);
  const requestControllerRef = React.useRef(null);
  const restorationRef = React.useRef(initialReturnState);
  const normalizedSearch = String(searchInput || '').trim();
  const effectiveQuery = debouncedSearch;
  const searchPending = normalizedSearch !== effectiveQuery;
  const currentSearchMeta = !searchPending && searchMeta?.query === normalizedSearch ? searchMeta : null;
  const visibleItemCount = classicItems.length;
  const hasMore = visibleItemCount < total;
  React.useEffect(() => {
    if (normalizedSearch === debouncedSearch) return undefined;
    activeRequestRef.current = null;
    requestControllerRef.current?.abort();
    loadingRef.current = false;
    setLoading(false);
    const timer = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 300);
    return () => window.clearTimeout(timer);
  }, [normalizedSearch, debouncedSearch]);
  const activeVlMandantId = vlMandants.find((mandant) => mandant.name.toLowerCase() === activeMandantName)?.id;
  const isGroupVl = vlMandantId === FRUPACK_GROUP_SCOPE;
  const isForeignVl = Boolean(
    !isGroupVl && vlMandantId
    && activeVlMandantId !== undefined
    && String(vlMandantId) !== String(activeVlMandantId),
  );
  const isItemReadOnly = React.useCallback((item) => isVlPositionReadOnly(item, activeVlMandantId, isForeignVl),
    [activeVlMandantId, isForeignVl]);
  const cartIds = React.useMemo(
    () => new Set(cartItems.map((item) => getItemId(item))),
    [cartItems],
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
    if (!vlMandantsLoaded) return;
    setSelectedItems((items) => items.filter((item) => !isItemReadOnly(item)));
  }, [isItemReadOnly, vlMandantsLoaded]);

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
        const groupEnabled = Boolean(meResponse?.identityResolved && meResponse?.features?.frupackGroupVl
          && mandantsResponse?.meta?.vlGroups?.some((group) => group.scope === FRUPACK_GROUP_SCOPE));
        setCanViewFrupackGroup(groupEnabled);
        setOptionsPreview(Boolean(meResponse?.identityResolved && meResponse?.features?.optionsVlPreview));
        const memberIds = mandantsResponse?.meta?.vlGroupMemberships?.[FRUPACK_GROUP_SCOPE] || [];
        setFrupackMandantIds(memberIds);
        const selection = resolveInitialVlSelection({
          mandants: options, activeMandantName: getMandant(), frupackMandantIds: memberIds,
          canViewGroup: groupEnabled, returnState: initialReturnState,
        });
        setVlMandantId(selection.id);
        if (!selection.restore) {
          restorationRef.current = null;
          setSelectedItems([]);
          setSearchInput('');
        }
      } catch {
        if (alive) setVlMandants([]);
      } finally {
        if (alive) setVlMandantsLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const getVlReturnState = React.useCallback(() => ({
    activeMandantName,
    vlMandantId,
    searchInput,
    page: Math.max(Number(page) || 1, 1),
    scrollTop: Number(listRef.current?.scrollTop || 0),
    selectedItems,
  }), [activeMandantName, page, searchInput, selectedItems, vlMandantId]);

  const loadPage = React.useCallback(async (nextPage, query, replace) => {
    if (!vlMandantsLoaded) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    const requestToken = {};
    const controller = new AbortController();
    requestControllerRef.current = controller;
    activeRequestRef.current = requestToken;
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
      if (vlMandantId === FRUPACK_GROUP_SCOPE) params.set('vlScope', FRUPACK_GROUP_SCOPE);
      else if (vlMandantId) params.set('vlMandantId', vlMandantId);
      const res = await apiRequest(`${optionsPreview ? '/vl/entries' : '/products'}?${params.toString()}`, { signal: controller.signal });
      if (activeRequestRef.current !== requestToken) return;
      const data = Array.isArray(res?.data) ? res.data : [];
      setGroupSourceNames((res?.meta?.viewMandants || []).map((mandant) => mandant.name));
      const nextTotal = Number(res?.meta?.total ?? 0);
      setClassicItems((previous) => (replace ? data : [...previous, ...data]));
      setPage(nextPage);
      setTotal(nextTotal);
      setSearchMeta(res?.meta?.search || null);
      setInitialLoaded(true);
      setRevealedRow({ id: '', side: '' });
    } catch (e) {
      if (activeRequestRef.current === requestToken) setError(e?.message || t('loading_error'));
    } finally {
      if (activeRequestRef.current === requestToken) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, [t, vlMandantId, vlMandantsLoaded, optionsPreview]);

  const loadNextPage = React.useCallback(async () => {
    if (searchPending) return;
    if (loadingRef.current) return;
    if (initialLoaded && !hasMore) return;
    await loadPage(page + 1, effectiveQuery, false);
  }, [effectiveQuery, hasMore, initialLoaded, loadPage, page, searchPending]);

  React.useEffect(() => {
    if (!vlMandantsLoaded) return undefined;
    let cancelled = false;
    const invalidateRequest = () => {
      cancelled = true;
      activeRequestRef.current = null;
      requestControllerRef.current?.abort();
      loadingRef.current = false;
    };
    const returnState = restorationRef.current;
    if (returnState) {
      restorationRef.current = null;
      setClassicItems([]);
      setPage(0);
      setTotal(0);
      setInitialLoaded(false);
      setRevealedRow({ id: '', side: '' });
      const targetPage = Math.max(Number(returnState.page) || 1, 1);
      const restorePages = async () => {
        for (let restorePage = 1; restorePage <= targetPage; restorePage += 1) {
          if (cancelled) return;
          await loadPage(restorePage, effectiveQuery, restorePage === 1);
        }
        if (cancelled) return;
        window.requestAnimationFrame(() => {
          if (listRef.current) listRef.current.scrollTop = Math.max(Number(returnState.scrollTop) || 0, 0);
        });
        const currentLocation = locationRef.current;
        const nextState = { ...(currentLocation.state || {}) };
        delete nextState.vlReturnState;
        navigate(`${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`, {
          replace: true,
          state: Object.keys(nextState).length ? nextState : null,
        });
      };
      void restorePages();
      return invalidateRequest;
    }
    setClassicItems([]);
    setPage(0);
    setTotal(0);
    setInitialLoaded(false);
    setRevealedRow({ id: '', side: '' });
    if (listRef.current) listRef.current.scrollTop = 0;
    void loadPage(1, effectiveQuery, true);
    return invalidateRequest;
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
    if (isItemReadOnly(item)) return;
    const itemId = getVlPositionKey(item);
    if (!itemId) return;
    setSelectedItems((previous) => {
      if (previous.some((entry) => getVlPositionKey(entry) === itemId)) {
        return previous.filter((entry) => getVlPositionKey(entry) !== itemId);
      }
      if (getAvailableAmount(item) <= 0) return previous;
      const group = getGroupInfo(item, lang);
      return [...previous, { ...item, groupKey: group.key, groupName: group.name }];
    });
    setBatchCartSuccess('');
  }, [isItemReadOnly, lang]);

  const addItemsToCart = React.useCallback(async (items) => {
    if (isForeignVl || cartAddingRef.current) return;
    const sourceItems = (Array.isArray(items) ? items : [])
      .filter((item) => !isItemReadOnly(item) && !cartIds.has(getItemId(item)) && getAvailableAmount(item) > 0);
    if (!sourceItems.length) return;
    const selectedIds = new Set(sourceItems.map((item) => getVlPositionKey(item)));
    cartAddingRef.current = true;
    try {
      setBatchCartAdding(true);
      setBatchCartError('');
      setBatchCartSuccess('');
      await addProductsToOrderCart(sourceItems.map((item) => ({
        ...item,
        id: getItemId(item),
        storageId: item.storageId || item.warehouseId,
      })), { vlMandantId: String(activeVlMandantId) });
      setCartItems(getOrderCartItems());
      setSelectedItems((previous) => previous.filter((item) => !selectedIds.has(getVlPositionKey(item))));
      setBatchCartSuccess(t('vl_batch_success', {
        count: sourceItems.length,
        positionLabel: getPositionLabel(sourceItems.length, t),
      }));
      setRevealedRow({ id: '', side: '' });
      const vlReturnState = getVlReturnState();
      navigate('/order-cart', {
        state: {
          fromVl: true,
          returnTo: createVlReturnTo(locationRef.current, {
            ...vlReturnState,
            selectedItems: vlReturnState.selectedItems.filter((item) => !selectedIds.has(getVlPositionKey(item))),
          }),
        },
      });
    } catch (e) {
      setBatchCartError(e?.message || t('loading_error'));
    } finally {
      cartAddingRef.current = false;
      setBatchCartAdding(false);
    }
  }, [activeVlMandantId, cartIds, getVlReturnState, isForeignVl, isItemReadOnly, navigate, t]);

  const getAddableSelectedItems = React.useCallback((item) => {
    const itemId = getVlPositionKey(item);
    const itemIsSelected = selectedItems.some((entry) => getVlPositionKey(entry) === itemId);
    if (!itemIsSelected) return [item];
    return selectedItems.filter((entry) => !isItemReadOnly(entry) && !cartIds.has(getItemId(entry)));
  }, [cartIds, isItemReadOnly, selectedItems]);

  const requestProductAction = React.useCallback((action, item) => {
    if (isItemReadOnly(item)) return;
    const vlReturnState = getVlReturnState();
    const itemId = getItemId(item);
    if (action === 'cart' && cartIds.has(itemId)) {
      removeOrderCartProduct(itemId);
      setCartItems(getOrderCartItems());
      setSelectedItems((previous) => previous.filter((entry) => getItemId(entry) !== itemId));
      setBatchCartSuccess('');
      return;
    }
    const sourceItems = action === 'cart' ? getAddableSelectedItems(item) : null;
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction(action === 'cart'
        ? { type: 'batchCart', items: sourceItems }
        : { type: action, product: item, vlReturnState });
      setCustomerRequiredOpen(true);
      return;
    }
    if (action === 'reserve') navigate('/orders/new', {
      state: {
        source: item,
        fromVl: true,
        vlMandantId: getProductSourceMandantId(item, vlMandantId),
        vlReturnState,
        returnTo: createVlReturnTo(location, vlReturnState),
      },
    });
    else if (action === 'cart') void addItemsToCart(sourceItems);
  }, [addItemsToCart, cartIds, getAddableSelectedItems, getVlReturnState, isItemReadOnly, location, navigate, vlMandantId]);

  const requestBatchCart = React.useCallback(() => {
    if (isForeignVl) return;
    const sourceItems = selectedItems.filter((item) => !isItemReadOnly(item) && !cartIds.has(getItemId(item)));
    if (!sourceItems.length) return;
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction({ type: 'batchCart', items: sourceItems });
      setCustomerRequiredOpen(true);
      return;
    }
    void addItemsToCart(sourceItems);
  }, [addItemsToCart, cartIds, isForeignVl, isItemReadOnly, selectedItems]);

  const chooseCustomer = React.useCallback(() => {
    if (!pendingCustomerAction) return;
    setCustomerRequiredOpen(false);
    navigate('/customers', {
      replace: true,
      state: {
        afterSelect: {
          to: '/vl',
          state: { ...(location.state || {}), pendingCustomerAction, vlReturnState: getVlReturnState() },
        },
      },
    });
  }, [getVlReturnState, location.state, navigate, pendingCustomerAction]);

  React.useEffect(() => {
    const pending = location.state?.pendingCustomerAction;
    if (!vlMandantsLoaded || isForeignVl || !pending || !getSelectedCustomer()?.id) return;
    const nextState = { ...(location.state || {}) };
    delete nextState.pendingCustomerAction;
    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });
    if (pending.type === 'batchCart' && Array.isArray(pending.items)) {
      setSelectedItems(pending.items.filter((item) => !isItemReadOnly(item)));
      void addItemsToCart(pending.items);
    } else if (pending.type === 'reserve' && pending.product && !isItemReadOnly(pending.product)) {
      const vlReturnState = pending.vlReturnState || getVlReturnState();
      navigate('/orders/new', {
        state: {
          source: pending.product,
          fromVl: true,
          vlMandantId: getProductSourceMandantId(pending.product, vlMandantId),
          vlReturnState,
          returnTo: createVlReturnTo(location, vlReturnState),
        },
      });
    } else if (pending.type === 'cart' && pending.product) {
      void addItemsToCart([pending.product]);
    }
  }, [addItemsToCart, getVlReturnState, isForeignVl, isItemReadOnly, location, navigate, vlMandantId, vlMandantsLoaded]);

  const handleAction = React.useCallback((action, item) => {
    setRevealedRow({ id: '', side: '' });
    if (action === 'select') toggleSelection(item);
    else requestProductAction(action, item);
  }, [requestProductAction, toggleSelection]);

  const openProductDetail = React.useCallback((item) => {
    if (item.kind === 'option') {
      const params = new URLSearchParams({ preview: '1', vlMandantId: String(item.sourceMandantId) });
      if (isGroupVl) params.set('vlScope', FRUPACK_GROUP_SCOPE);
      navigate(`/options/${encodeURIComponent(item.optionId)}?${params.toString()}#position-${item.optionPositionId}`, {
        state: { returnTo: createVlReturnTo(location, getVlReturnState()) },
      });
      return;
    }
    navigate(`/products/${encodeURIComponent(getItemId(item))}`, {
      state: {
        backgroundLocation: location,
        fromVl: true,
        vlMandantId: getProductSourceMandantId(item, vlMandantId),
        vlReadOnly: isItemReadOnly(item),
        vlScope: isGroupVl ? FRUPACK_GROUP_SCOPE : '',
        vlReturnState: getVlReturnState(),
        returnTo: createVlReturnTo(location, getVlReturnState()),
      },
    });
  }, [getVlReturnState, isGroupVl, isItemReadOnly, location, navigate, vlMandantId]);

  const handleRowTap = React.useCallback((item) => {
    const itemId = getVlPositionKey(item);
    if (revealedRow.id && String(revealedRow.id) === String(itemId)) {
      setRevealedRow({ id: '', side: '' });
      return;
    }
    openProductDetail(item);
  }, [openProductDetail, revealedRow]);

  const handleVlMandantChange = React.useCallback((event) => {
    const nextId = String(event.target.value || '');
    if (nextId === vlMandantId) return;
    restorationRef.current = null;
    setVlMandantId(nextId);
    setSelectedItems([]);
    setBatchCartError('');
    setBatchCartSuccess('');
    setPendingCustomerAction(null);
    setCustomerRequiredOpen(false);
    setClassicItems([]);
    setPage(0);
    setTotal(0);
    setInitialLoaded(false);
    setRevealedRow({ id: '', side: '' });
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [vlMandantId]);

  let lastClassicGroup = '';
  const renderClassic = () => sortVlItems(classicItems).map((item, index) => {
    const group = buildGroupTitle(item, lang);
    const showHeader = group !== lastClassicGroup;
    if (showHeader) lastClassicGroup = group;
    return (
      <Box key={getVlPositionKey(item)} sx={{ mb: 0.4 }}>
        {showHeader && <Typography variant="subtitle2" sx={{ mt: 1.2, mb: 0.35, fontWeight: 700 }}>{group}</Typography>}
        {item.kind === 'option' ? <OptionVlRow item={item} onOpen={openProductDetail} showSource={isGroupVl} t={t} lang={lang} /> : <SwipeableProductRow
          item={item}
          selected={selectedItems.some((entry) => getVlPositionKey(entry) === getVlPositionKey(item))}
          index={index}
          isFinePointer={isFinePointer}
          revealedRow={revealedRow}
          onReveal={(id, side) => setRevealedRow({ id, side })}
          onToggleSelection={toggleSelection}
          onTap={handleRowTap}
          onAction={handleAction}
          onEmployeeClick={(shortCode) => navigate(`/employees/${encodeURIComponent(shortCode)}`, { state: { returnTo: createReturnTo(location) } })}
          inCart={!isItemReadOnly(item) && cartIds.has(getItemId(item))}
          readOnly={isItemReadOnly(item)}
          foreign={isGroupVl && isItemReadOnly(item)}
          showSource={isGroupVl}
          t={t}
          lang={lang}
        />}
      </Box>
    );
  });

  const selectedCount = selectedItems.length;
  const vlDropdownOptions = buildVlDropdownOptions(vlMandants, {
    frupackMandantIds, canViewGroup: canViewFrupackGroup, groupLabel: t('vl_frupack_group'),
  });

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {location.state?.returnTo?.pathname && (
              <IconButton
                aria-label={t('back_label')}
                onClick={() => navigateToReturn(navigate, location.state.returnTo, '/customers')}
              >
                <ArrowBackIcon />
              </IconButton>
            )}
            <Typography variant="h5">{t('vl_title')}</Typography>
          </Box>
          <TextField
            select
            size="small"
            label={t('vl_mandant_label')}
            value={vlMandantId}
            onChange={handleVlMandantChange}
            disabled={!vlMandantsLoaded || vlMandants.length === 0 || batchCartAdding}
            sx={{ minWidth: 150, flexShrink: 0 }}
            SelectProps={{ MenuProps: { PaperProps: { style: { maxHeight: 320 } } } }}
          >
            {vlDropdownOptions.map((mandant) => (
              <MenuItem key={mandant.id} value={String(mandant.id)}>{mandant.name}</MenuItem>
            ))}
          </TextField>
        </Box>

        {isGroupVl && groupSourceNames.length > 0 && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.35 }}>
            {groupSourceNames.join(' · ')}
          </Typography>
        )}

        {!isForeignVl && selectedCount > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, minWidth: 0, mt: 0.25, pl: 0.25 }}>
            <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
              {t('vl_selected', { count: selectedCount })}
            </Typography>
            <IconButton size="small" color="primary" aria-label={t('vl_batch_add_selected')} title={t('vl_batch_add_selected')} disabled={batchCartAdding} onClick={requestBatchCart}>
              <ShoppingCartIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        <TextField
          fullWidth
          size="small"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('vl_search_example')}
          inputProps={{ 'aria-label': t('vl_search'), maxLength: 500 }}
          sx={{ mt: 0.75 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {searchPending && <CircularProgress size={16} sx={{ mr: 0.5 }} />}
                <IconButton size="small" aria-label="clear-search" onClick={() => setSearchInput('')}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        {currentSearchMeta?.conditions?.length > 0 && (
          <Box aria-label={t('vl_search_conditions')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, maxHeight: 88, overflowY: 'auto' }}>
            {currentSearchMeta.conditions.map((condition) => (
              <Chip key={condition.id} size="small" variant="outlined" label={formatSearchCondition(condition, lang)}
                onDelete={() => setSearchInput(condition.queryWithout)} />
            ))}
          </Box>
        )}
        {currentSearchMeta?.warnings?.map((warning) => (
          <Typography key={warning} variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            {t(`vl_search_warning_${warning}`)}
          </Typography>
        ))}
        {normalizedSearch && !searchPending && initialLoaded && !loading && (
          <Typography variant="caption" aria-live="polite" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
            {t('vl_search_count', { count: total })}
          </Typography>
        )}
      </Box>

      {optionsPreview && <Typography variant="caption" sx={{ color: '#23752A', mb: 0.5 }}>
        {lang === 'en' ? 'Option preview includes expired offers for information.' : 'Optionen-Testansicht: inklusive abgelaufener Angebote zur Information.'}
      </Typography>}
      <Box ref={listRef} aria-busy={loading || searchPending} sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', pr: 0.25 }}>
        {error && <Alert severity="error" sx={{ mt: 1, mb: 1.25 }}>{error}</Alert>}
        {batchCartError && <Alert severity="error" sx={{ mt: 1, mb: 1.25 }}>{batchCartError}</Alert>}
        {batchCartSuccess && <Alert severity="success" sx={{ mt: 1, mb: 1.25 }}>{batchCartSuccess}</Alert>}
        {!loading && initialLoaded && visibleItemCount === 0 && <Typography sx={{ opacity: 0.7, mt: 1 }}>{t('vl_empty')}</Typography>}
        {!loading && !searchPending && initialLoaded && visibleItemCount === 0 && currentSearchMeta?.conditions?.length > 1 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {currentSearchMeta.conditions.map((condition) => (
              <Button key={condition.id} size="small" onClick={() => setSearchInput(condition.queryWithout)}>
                {t('vl_search_without', { condition: formatSearchCondition(condition, lang) })}
              </Button>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, mt: 0.5 }}>
          {renderClassic()}
        </Box>
        <Box ref={sentinelRef} sx={{ height: 18 }} />
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
            <CircularProgress size={22} />
          </Box>
        )}
      </Box>

      <CustomerRequiredDialog open={customerRequiredOpen} onClose={() => setCustomerRequiredOpen(false)} onChoose={chooseCustomer} />
    </Box>
  );
}

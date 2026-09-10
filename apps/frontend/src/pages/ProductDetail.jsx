import React from 'react';
import {
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
  Divider,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { addProductsToOrderCart } from '../utils/orderCartProducts.js';
import { getSelectedCustomer, setSelectedCustomer } from '../utils/customerSelection.js';
import CustomerRequiredDialog from '../components/CustomerRequiredDialog.jsx';
import TempPlanningHint from '../components/TempPlanningHint.jsx';

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
}

function formatDateDe(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('de-DE');
}

function InfoRow({ label, value }) {
  return (
    <Box
      sx={{
        display: { xs: 'grid', md: 'flex' },
        gridTemplateColumns: 'minmax(0, 1fr)',
        alignItems: { xs: 'start', md: 'center' },
        justifyContent: 'space-between',
        gap: { xs: 0.25, md: 2 },
        py: 0.75,
        minWidth: 0,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          width: { xs: '100%', md: '40%' },
          maxWidth: { xs: '100%', md: '40%' },
          minWidth: 0,
          textAlign: { xs: 'left', md: 'right' },
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value || ''}
      </Typography>
    </Box>
  );
}

export default function ProductDetail({ modal = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const vlMandantId = String(location.state?.vlMandantId || '').trim();
  const readOnlyVl = Boolean(location.state?.vlReadOnly);
  const sourceQuery = vlMandantId ? `?vlMandantId=${encodeURIComponent(vlMandantId)}` : '';

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [reserveOpen, setReserveOpen] = React.useState(false);
  const [reserveAmount, setReserveAmount] = React.useState('');
  const [reserveDate, setReserveDate] = React.useState('');
  const [reserveComment, setReserveComment] = React.useState('');
  const [reserveLoading, setReserveLoading] = React.useState(false);
  const [reserveSuccess, setReserveSuccess] = React.useState('');
  const [reserveInfo, setReserveInfo] = React.useState('');
  const [reserveError, setReserveError] = React.useState('');
  const [cartError, setCartError] = React.useState('');
  const [cartSuccess, setCartSuccess] = React.useState('');
  const [cartAdding, setCartAdding] = React.useState(false);
  const [wpzExists, setWpzExists] = React.useState(false);
  const [wpzId, setWpzId] = React.useState(null);
  const [wpzData, setWpzData] = React.useState(null);
  const [wpzLoading, setWpzLoading] = React.useState(false);
  const [wpzOpen, setWpzOpen] = React.useState(false);
  const [customerRequiredOpen, setCustomerRequiredOpen] = React.useState(false);
  const [pendingCustomerAction, setPendingCustomerAction] = React.useState('');
  const [customerPromptType, setCustomerPromptType] = React.useState('generic');
  const sourceCustomer = location.state?.fromCustomer || null;
  const availableAmount = React.useMemo(() => {
    const backendAvailable = Number(item?.availableAmount);
    if (Number.isFinite(backendAvailable)) return Math.max(backendAvailable, 0);
    const total = Number(item?.amount ?? 0);
    const reserved = Number(item?.reserved ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(reserved)) return null;
    return Math.max(total - reserved, 0);
  }, [item]);
  const reserveAmountNum = Number(reserveAmount);
  const reserveTooMuch = availableAmount !== null && Number.isFinite(reserveAmountNum) && reserveAmountNum > availableAmount;
  const isAlreadyReserved = React.useMemo(() => {
    const reserved = Number(item?.reserved ?? 0);
    return (Number.isFinite(reserved) && reserved > 0) || Boolean(String(item?.reservedBy || '').trim());
  }, [item]);
  const reservedBy = React.useMemo(() => String(item?.reservedBy || '').trim(), [item]);

  const openReserveDialog = React.useCallback(() => {
    if (isAlreadyReserved) {
      const msg = reservedBy
        ? t('product_already_reserved_by', { by: reservedBy })
        : t('product_already_reserved');
      setReserveInfo(msg);
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setReserveDate(tomorrow.toISOString().slice(0, 10));
    setReserveAmount('');
    setReserveComment('');
    setReserveInfo('');
    setReserveError('');
    setReserveOpen(true);
  }, [isAlreadyReserved, reservedBy, t]);

  const addProductToCart = React.useCallback(async () => {
    if (!item || !Number.isFinite(availableAmount) || availableAmount <= 0) {
      setCartError(t('validation_cart_quantity_positive'));
      return;
    }
    try {
      setCartAdding(true);
      setCartError('');
      await addProductsToOrderCart([{
        ...item,
        wpzId,
        wpzOriginal: wpzId ? true : null,
        wpzComment: 'Original verwenden',
      }], { vlMandantId });
      setCartSuccess(t('cart_added'));
    } catch (e) {
      setCartError(e?.message || t('loading_error'));
    } finally {
      setCartAdding(false);
    }
  }, [availableAmount, item, t, vlMandantId, wpzId]);

  const requestProductAction = React.useCallback((action) => {
    if (!getSelectedCustomer()?.id) {
      setPendingCustomerAction(action);
      setCustomerPromptType(sourceCustomer?.id ? 'context' : 'generic');
      setCustomerRequiredOpen(true);
      return;
    }
    if (action === 'reserve') {
      openReserveDialog();
    } else if (action === 'cart') {
      void addProductToCart();
    }
  }, [addProductToCart, openReserveDialog, sourceCustomer]);

  const chooseContextCustomer = React.useCallback(() => {
    const selected = setSelectedCustomer(sourceCustomer);
    const action = pendingCustomerAction;
    setCustomerRequiredOpen(false);
    setCustomerPromptType('generic');
    setPendingCustomerAction('');
    if (!selected) return;
    if (action === 'reserve') {
      openReserveDialog();
    } else if (action === 'cart') {
      void addProductToCart();
    }
  }, [addProductToCart, openReserveDialog, pendingCustomerAction, sourceCustomer]);

  const chooseCustomer = React.useCallback(() => {
    if (!pendingCustomerAction) return;
    setCustomerRequiredOpen(false);
    setCustomerPromptType('generic');
    navigate('/customers', {
      state: {
        afterSelect: {
          to: location.pathname,
          state: {
            ...(location.state || {}),
            pendingCustomerAction,
          },
        },
      },
    });
  }, [location.pathname, location.state, navigate, pendingCustomerAction]);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        setWpzLoading(true);
        setWpzExists(false);
        setWpzId(null);
        setWpzData(null);
        setWpzOpen(false);
        const res = await apiRequest(`/products/${encodeURIComponent(id)}${sourceQuery}`);
        if (!alive) return;
        const baseItem = res?.data || null;
        if (!baseItem) {
          setItem(null);
          setWpzLoading(false);
          return;
        }
        try {
          const wpzRes = await apiRequest(`/products/${encodeURIComponent(id)}/wpz${sourceQuery}`);
          if (alive) {
            setWpzData(wpzRes?.data || null);
            setWpzExists(Boolean(wpzRes?.data?.exists));
            const idNum = Number(wpzRes?.data?.wpzId);
            setWpzId(Number.isFinite(idNum) && idNum > 0 ? idNum : null);
          }
        } catch {
          if (alive) {
            setWpzData(null);
            setWpzExists(false);
            setWpzId(null);
          }
        } finally {
          if (alive) setWpzLoading(false);
        }
        setItem(baseItem);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_error'));
        setWpzLoading(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, sourceQuery, t]);

  React.useEffect(() => {
    const action = location.state?.pendingCustomerAction;
    if (!action || !item || !getSelectedCustomer()?.id) return;

    const nextState = { ...(location.state || {}) };
    delete nextState.pendingCustomerAction;
    navigate(location.pathname, {
      replace: true,
      state: Object.keys(nextState).length ? nextState : null,
    });

    if (action === 'reserve') {
      openReserveDialog();
    } else if (action === 'cart') {
      void addProductToCart();
    }
  }, [addProductToCart, item, location.pathname, location.state, navigate, openReserveDialog]);

  const handleBack = React.useCallback(() => {
    const fromVl = Boolean(location.state?.fromVl);
    if (fromVl) {
      navigate('/vl', {
        replace: true,
        state: location.state?.vlReturnState
          ? { vlReturnState: location.state.vlReturnState }
          : null,
      });
      return;
    }
    const fromProducts = location.state?.fromProducts;
    if (fromProducts) {
      navigate('/products', { state: { listState: fromProducts } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  const detailBody = (
    <>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {cartError && <Alert severity="error" sx={{ mb: 2 }}>{cartError}</Alert>}
      {reserveInfo && <Alert severity="warning" sx={{ mb: 2 }}>{reserveInfo}</Alert>}
      {reserveSuccess && <Alert severity="success" sx={{ mb: 2 }}>{reserveSuccess}</Alert>}
      {cartSuccess && <Alert severity="success" sx={{ mb: 2 }}>{cartSuccess}</Alert>}

      {!loading && !error && item && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ pt: 2, minWidth: 0 }}>
            <Box
              sx={{
                display: { xs: 'grid', md: 'flex' },
                gridTemplateColumns: 'minmax(0, 1fr)',
                alignItems: { xs: 'start', md: 'center' },
                justifyContent: 'space-between',
                gap: { xs: 0.25, md: 2 },
                mb: 2,
                minWidth: 0,
              }}
            >
              <Typography variant="subtitle2" color="text.secondary">
                {t('product_price')}
              </Typography>
              <Typography variant="h6" sx={{ minWidth: 0, textAlign: { xs: 'left', md: 'right' }, overflowWrap: 'anywhere' }}>
                {formatPrice(item.acquisitionPrice)}
              </Typography>
            </Box>

            {!readOnlyVl && (
              <>
                <Button
                  variant="contained"
                  fullWidth
                  sx={{ mb: 1 }}
                  onClick={() => requestProductAction('reserve')}
                >
                  {t('product_reserve_submit')}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<ShoppingCartIcon />}
                  sx={{ mb: 2 }}
                  disabled={cartAdding || !Number.isFinite(availableAmount) || availableAmount <= 0}
                  onClick={() => requestProductAction('cart')}
                >
                  {t('cart_add')}
                </Button>
              </>
            )}

            <InfoRow label={t('product_be_number')} value={item.beNumber} />
            <InfoRow label={t('product_category')} value={item.category} />
            <InfoRow label={t('product_amount')} value={item.amount} />
            <InfoRow label={t('product_reserved')} value={item.reserved} />
            <TempPlanningHint
              item={item}
              onEmployeeClick={(shortCode) => navigate(`/employees/${encodeURIComponent(shortCode)}`)}
              t={t}
            />
            <InfoRow label={t('product_unit')} value={item.unit} />
            <Divider sx={{ my: 2 }} />
            <InfoRow label={t('product_warehouse')} value={item.warehouse} />
            <InfoRow label={t('product_description')} value={item.description} />

            <Divider sx={{ my: 2 }} />

            <InfoRow label={t('product_mfi')} value={item.mfi} />
            <InfoRow label={t('product_mfi_measured')} value={item.mfiMeasured} />
            <InfoRow label={t('product_mfi_method')} value={item.mfiTestMethod} />
            <InfoRow
              label={t('wpz_label')}
              value={
                wpzLoading ? t('products_loading_items') : (
                  wpzExists ? (
                    <Button size="small" onClick={() => setWpzOpen(true)}>
                      {t('wpz_available')}
                    </Button>
                  ) : t('wpz_not_available')
                )
              }
            />
            <Divider sx={{ my: 2 }} />
            <InfoRow label={t('product_reserved_by')} value={item.reservedBy} />
            <InfoRow label={t('product_reserved_until')} value={formatDateDe(item.reservedUntil)} />

            <Divider sx={{ my: 2 }} />

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {t('product_extra')}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                {item.about || ''}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </>
  );

  const reserveDialog = (
    <Dialog open={reserveOpen} onClose={() => (!reserveLoading ? setReserveOpen(false) : undefined)} fullWidth maxWidth="sm">
      <DialogTitle>{t('product_reserve_submit')}</DialogTitle>
      <DialogContent>
        {reserveError && <Alert severity="error" sx={{ mb: 1 }}>{reserveError}</Alert>}
        <TextField
          margin="dense"
          fullWidth
          type="number"
          label={t('product_reserve_amount')}
          value={reserveAmount}
          onChange={(e) => setReserveAmount(e.target.value)}
          inputProps={{ min: 1, step: 'any' }}
          error={reserveTooMuch}
          helperText={
            reserveTooMuch
              ? t('product_reserve_too_much')
              : (availableAmount !== null ? `${t('product_available_now')}: ${availableAmount} ${item?.unit || ''}` : '')
          }
        />
        <TextField
          margin="dense"
          fullWidth
          type="date"
          label={t('product_reserve_until')}
          value={reserveDate}
          onChange={(e) => setReserveDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          margin="dense"
          fullWidth
          multiline
          minRows={2}
          label={t('product_reserve_comment')}
          value={reserveComment}
          onChange={(e) => setReserveComment(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setReserveOpen(false)} disabled={reserveLoading}>
          {t('back_label')}
        </Button>
        <Button
          variant="contained"
          disabled={reserveLoading || !reserveAmount || !reserveDate || reserveTooMuch}
          onClick={async () => {
            try {
              setReserveLoading(true);
              setReserveError('');
              setReserveSuccess('');
              setReserveInfo('');
              await apiRequest('/products/reserve', {
                method: 'POST',
                body: JSON.stringify({
                  productId: item?.id,
                  beNumber: item?.beNumber,
                  warehouseId: item?.storageId,
                  amount: Number(reserveAmount),
                  reservationEndDate: reserveDate,
                  comment: reserveComment || '',
                  sourceMandantId: item?.sourceMandantId ?? vlMandantId ?? null,
                }),
              });
              setReserveOpen(false);
              setReserveSuccess(t('product_reserve_confirmed'));
              navigate('/orders', {
                state: {
                  sourceMandantId: item?.sourceMandantId ?? vlMandantId ?? null,
                },
              });
            } catch (e) {
              if (e?.code === 'RESERVATION_ALREADY_EXISTS') {
                const by = String(e?.payload?.error?.details?.reservedBy || '').trim();
                setReserveOpen(false);
                setReserveInfo(by ? t('product_already_reserved_by', { by }) : t('product_already_reserved'));
              } else {
                setReserveError(e?.message || t('loading_error'));
              }
            } finally {
              setReserveLoading(false);
            }
          }}
        >
          {t('product_reserve_submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );

  const wpzDialog = (
    <Dialog open={wpzOpen} onClose={() => setWpzOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{t('wpz_title')}</DialogTitle>
      <DialogContent dividers>
        {wpzData?.exists ? (
          <>
            <InfoRow label={t('product_be_number')} value={wpzData.beNumber || id} />
            <Divider sx={{ my: 2 }} />
            {(Array.isArray(wpzData.fields) ? wpzData.fields : []).map((field, idx) => (
              <InfoRow
                key={`${field?.key || 'field'}-${idx}`}
                label={String(field?.key || '-')}
                value={field?.value === null || field?.value === undefined || field?.value === '' ? '-' : String(field.value)}
              />
            ))}
          </>
        ) : (
          <Alert severity="info">{t('wpz_not_available')}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setWpzOpen(false)}>{t('back_label')}</Button>
      </DialogActions>
    </Dialog>
  );

  const customerDialog = (
    <CustomerRequiredDialog
      open={customerRequiredOpen}
      onClose={() => {
        setCustomerRequiredOpen(false);
        setCustomerPromptType('generic');
        setPendingCustomerAction('');
      }}
      onChoose={customerPromptType === 'context' ? chooseContextCustomer : chooseCustomer}
      title={customerPromptType === 'context' ? t('customer_context_required_title') : undefined}
      message={customerPromptType === 'context'
        ? t('customer_context_required_message', { name: sourceCustomer?.name || sourceCustomer?.id || '' })
        : undefined}
      chooseLabel={customerPromptType === 'context' ? t('customer_context_required_choose') : undefined}
    />
  );

  const closeModal = () => {
    if (!reserveLoading) navigate(-1);
  };

  if (modal) {
    return (
      <>
        <Dialog
          open
          fullWidth
          maxWidth="md"
          scroll="paper"
          onClose={closeModal}
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {item?.article || id}
            </Typography>
            <IconButton aria-label={t('close_label')} onClick={closeModal} disabled={reserveLoading}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ minWidth: 0 }}>
            {detailBody}
          </DialogContent>
        </Dialog>
        {reserveDialog}
        {wpzDialog}
        {customerDialog}
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <IconButton aria-label="back" onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {item?.article || id}
          </Typography>
        </Box>
      </Box>
      {detailBody}
      {reserveDialog}
      {wpzDialog}
      {customerDialog}
    </Box>
  );
}

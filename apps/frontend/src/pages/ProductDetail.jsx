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
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { addOrderCartItem } from '../utils/orderCart.js';

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
  const location = useLocation();
  const { t } = useI18n();

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
  const [cartOpen, setCartOpen] = React.useState(false);
  const [cartQty, setCartQty] = React.useState('');
  const [cartSuccess, setCartSuccess] = React.useState('');
  const availableAmount = React.useMemo(() => {
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

  const handleBack = React.useCallback(() => {
    const fromProducts = location.state?.fromProducts;
    if (fromProducts) {
      navigate('/products', { state: { listState: fromProducts } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={handleBack}>
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
      {reserveInfo && <Alert severity="warning" sx={{ mb: 2 }}>{reserveInfo}</Alert>}
      {reserveSuccess && <Alert severity="success" sx={{ mb: 2 }}>{reserveSuccess}</Alert>}
      {cartSuccess && <Alert severity="success" sx={{ mb: 2 }}>{cartSuccess}</Alert>}

      {!loading && !error && item && (
        <Card>
          <CardContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {t('product_price')}
              </Typography>
              <Typography variant="h6">{formatPrice(item.acquisitionPrice)}</Typography>
            </Box>

            <Button
              variant="contained"
              fullWidth
              sx={{ mb: 1 }}
              onClick={() => {
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
                setReserveOpen(true);
              }}
            >
              {t('product_reserve_submit')}
            </Button>
            <Button
              variant="outlined"
              fullWidth
              sx={{ mb: 1 }}
              onClick={() => navigate('/temp-orders/new', {
                state: {
                  source: {
                    beNumber: item?.beNumber,
                    warehouseId: item?.storageId,
                    amountInKg: item?.amount,
                    price: item?.acquisitionPrice,
                    article: item?.article,
                  },
                },
              })}
            >
              {t('product_create_order')}
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ShoppingCartIcon />}
              sx={{ mb: 2 }}
              onClick={() => {
                setCartQty('');
                setCartOpen(true);
              }}
            >
              {t('cart_add')}
            </Button>

            <InfoRow label={t('product_be_number')} value={item.beNumber} />
            <InfoRow label={t('product_category')} value={item.category} />
            <InfoRow label={t('product_amount')} value={item.amount} />
            <InfoRow label={t('product_reserved')} value={item.reserved} />
            <InfoRow label={t('product_unit')} value={item.unit} />
            <Divider sx={{ my: 2 }} />
            <InfoRow label={t('product_warehouse')} value={item.warehouse} />
            <InfoRow label={t('product_description')} value={item.description} />

            <Divider sx={{ my: 2 }} />

            <InfoRow label={t('product_mfi')} value={item.mfi} />
            <InfoRow label={t('product_mfi_measured')} value={item.mfiMeasured} />
            <InfoRow label={t('product_mfi_method')} value={item.mfiTestMethod} />
            <Divider sx={{ my: 2 }} />
            <InfoRow label={t('product_reserved_by')} value={item.reservedBy} />
            <InfoRow label={t('product_reserved_until')} value={item.reservedUntil} />

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

      <Dialog open={reserveOpen} onClose={() => setReserveOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('product_reserve_submit')}</DialogTitle>
        <DialogContent>
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
                setError('');
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
                  }),
                });
                setReserveOpen(false);
                setReserveSuccess(t('product_reserve_confirmed'));
                navigate('/orders');
              } catch (e) {
                if (e?.code === 'RESERVATION_ALREADY_EXISTS') {
                  const by = String(e?.payload?.error?.details?.reservedBy || '').trim();
                  setReserveOpen(false);
                  setReserveInfo(by ? t('product_already_reserved_by', { by }) : t('product_already_reserved'));
                } else {
                  setError(e?.message || t('loading_error'));
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

      <Dialog open={cartOpen} onClose={() => setCartOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('cart_add')}</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            fullWidth
            type="number"
            label={t('cart_quantity')}
            value={cartQty}
            onChange={(e) => setCartQty(e.target.value)}
            inputProps={{ min: 1, step: 'any' }}
            helperText={availableAmount !== null ? `${t('product_available_now')}: ${availableAmount} ${item?.unit || ''}` : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCartOpen(false)}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(cartQty);
              if (!Number.isFinite(qty) || qty <= 0) {
                setError(t('validation_cart_quantity_positive'));
                return;
              }
              if (availableAmount !== null && qty > availableAmount) {
                setError(t('validation_cart_quantity_not_above_available'));
                return;
              }
              addOrderCartItem(item, qty);
              setCartOpen(false);
              setCartSuccess(t('cart_added'));
            }}
          >
            {t('cart_add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

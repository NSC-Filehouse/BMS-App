import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../utils/i18n.jsx';
import {
  getOrderCartItems,
  removeOrderCartItem,
  updateOrderCartQuantity,
  updateOrderCartSalePrice,
  updateOrderCartItem,
} from '../utils/orderCart.js';

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

export default function OrderCart() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [items, setItems] = React.useState(() => getOrderCartItems());
  const [error, setError] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState({});

  const onQtyChange = (id, value) => {
    const qty = Number(value);
    if (Number.isFinite(qty) && qty > 0) {
      setItems(updateOrderCartQuantity(id, qty));
    } else {
      setItems((prev) => prev.map((x) => (
        String(x.id) === String(id) ? { ...x, quantityKg: value } : x
      )));
    }
  };

  const onSalePriceChange = (id, value) => {
    const price = Number(value);
    if (Number.isFinite(price) && price > 0) {
      setItems(updateOrderCartSalePrice(id, price));
    } else {
      setItems((prev) => prev.map((x) => (
        String(x.id) === String(id) ? { ...x, salePrice: value } : x
      )));
    }
  };

  const validate = () => {
    const messages = [];
    const nextFieldErrors = {};
    const pushFieldError = (rowId, field) => {
      const key = String(rowId || '');
      if (!nextFieldErrors[key]) nextFieldErrors[key] = {};
      nextFieldErrors[key][field] = true;
    };
    for (const x of items) {
      const qty = Number(x.quantityKg);
      if (!Number.isFinite(qty) || qty <= 0) {
        messages.push(t('validation_cart_quantity_positive'));
        pushFieldError(x.id, 'quantityKg');
        continue;
      }
      const available = Number(x.availableAmount);
      if (Number.isFinite(available) && qty > available) {
        messages.push(t('validation_cart_quantity_not_above_available'));
        pushFieldError(x.id, 'quantityKg');
      }
      const salePrice = Number(x.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(t('validation_sale_price_positive'));
        pushFieldError(x.id, 'salePrice');
      }
      if (x.wpzId && x.wpzOriginal === false && !String(x.wpzComment || '').trim()) {
        messages.push(t('validation_wpz_comment_required'));
        pushFieldError(x.id, 'wpzComment');
      }
    }
    return { messages, nextFieldErrors };
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton
          aria-label="back"
          onClick={() => {
            if (location.state?.fromVl) {
              navigate('/vl');
              return;
            }
            if (window.history.length > 1) {
              navigate(-1);
              return;
            }
            navigate('/products');
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">{t('cart_title')}</Typography>
      </Box>

      {items.length === 0 && <Typography sx={{ opacity: 0.7 }}>{t('cart_empty')}</Typography>}

      {items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {items.map((row) => (
            <Card key={row.id}>
              <CardContent sx={{ display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="subtitle1">{row.article || row.beNumber}</Typography>
                  <IconButton
                    aria-label={t('cart_remove')}
                    color="error"
                    onClick={() => setItems(removeOrderCartItem(row.id))}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Box>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {t('product_be_number')}: {row.beNumber || '-'} | {t('product_storage_id')}: {row.warehouseId || '-'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {t('product_available_now')}: {row.availableAmount ?? '-'} {row.unit || 'kg'} | {t('product_price')}: {formatPrice(row.acquisitionPrice)}
                </Typography>
            {(() => {
              const rowErr = fieldErrors[String(row.id || '')] || {};
              return (
                <>
                <TextField
                  type="number"
                  label={t('cart_quantity')}
                  value={row.quantityKg}
                  onChange={(e) => onQtyChange(row.id, e.target.value)}
                  inputProps={{ min: 1, step: 'any' }}
                  size="small"
                  required
                  error={Boolean(rowErr.quantityKg)}
                  helperText={rowErr.quantityKg ? t('validation_cart_quantity_positive') : ''}
                />
                <TextField
                  type="number"
                  label={t('order_sale_price')}
                  value={row.salePrice ?? ''}
                  onChange={(e) => onSalePriceChange(row.id, e.target.value)}
                  inputProps={{ min: 0.01, step: 'any' }}
                  size="small"
                  required
                  error={Boolean(rowErr.salePrice)}
                  helperText={rowErr.salePrice ? t('validation_sale_price_positive') : ''}
                />
                {row.wpzId ? (
                  <>
                    <FormControlLabel
                      control={(
                        <Checkbox
                          checked={row.wpzOriginal !== false}
                          onChange={(e) => setItems(updateOrderCartItem(row.id, {
                            wpzOriginal: e.target.checked,
                            ...(e.target.checked ? { wpzComment: '' } : {}),
                          }))}
                        />
                      )}
                      label={t('wpz_original_use')}
                    />
                  </>
                ) : (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {t('wpz_label')}: {t('wpz_not_available')}
                  </Typography>
                )}
                <TextField
                  label={t('wpz_comment_label')}
                  value={row.wpzComment || ''}
                  onChange={(e) => setItems(updateOrderCartItem(row.id, { wpzComment: e.target.value }))}
                  multiline
                  minRows={2}
                  size="small"
                  error={Boolean(rowErr.wpzComment)}
                  helperText={rowErr.wpzComment ? t('validation_wpz_comment_required') : ''}
                />
                </>
              );
            })()}
              </CardContent>
            </Card>
          ))}

          {error && <Alert severity="error" sx={{ mb: 0.5 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => {
                const { messages, nextFieldErrors } = validate();
                if (messages.length) {
                  setFieldErrors(nextFieldErrors);
                  setError(t('validation_fill_required_fields'));
                  return;
                }
                setFieldErrors({});
                setError('');
                navigate('/temp-orders/new', {
                  state: {
                    sourceItems: items.map((x) => ({
                      id: x.id,
                      article: x.article,
                      beNumber: x.beNumber,
                      warehouseId: x.warehouseId,
                      amountInKg: Number(x.quantityKg),
                      salePrice: Number(x.salePrice),
                      costPrice: Number(x.acquisitionPrice),
                      wpzId: x.wpzId ?? null,
                      wpzOriginal: x.wpzOriginal ?? true,
                      wpzComment: x.wpzComment || '',
                    })),
                  },
                });
              }}
            >
              {t('cart_create_order')}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../utils/i18n.jsx';
import {
  getOrderCartItems,
  removeOrderCartItem,
  updateOrderCartQuantity,
  updateOrderCartSalePrice,
} from '../utils/orderCart.js';

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

export default function OrderCart() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = React.useState(() => getOrderCartItems());
  const [error, setError] = React.useState('');

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
    for (const x of items) {
      const qty = Number(x.quantityKg);
      if (!Number.isFinite(qty) || qty <= 0) {
        messages.push(`${x.article || x.beNumber}: ${t('validation_cart_quantity_positive')}`);
        continue;
      }
      const available = Number(x.availableAmount);
      if (Number.isFinite(available) && qty > available) {
        messages.push(`${x.article || x.beNumber}: ${t('validation_cart_quantity_not_above_available')}`);
      }
      const salePrice = Number(x.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(`${x.article || x.beNumber}: ${t('validation_sale_price_positive')}`);
      }
    }
    return messages;
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={() => navigate('/products')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">{t('cart_title')}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
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
                <TextField
                  type="number"
                  label={t('cart_quantity')}
                  value={row.quantityKg}
                  onChange={(e) => onQtyChange(row.id, e.target.value)}
                  inputProps={{ min: 1, step: 'any' }}
                  size="small"
                />
                <TextField
                  type="number"
                  label={t('order_sale_price')}
                  value={row.salePrice ?? ''}
                  onChange={(e) => onSalePriceChange(row.id, e.target.value)}
                  inputProps={{ min: 0.01, step: 'any' }}
                  size="small"
                />
              </CardContent>
            </Card>
          ))}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => {
                const msgs = validate();
                if (msgs.length) {
                  setError(msgs.join(' | '));
                  return;
                }
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

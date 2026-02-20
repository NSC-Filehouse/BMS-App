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
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import {
  getOrderCartItems,
  removeOrderCartItem,
  updateOrderCartQuantity,
  updateOrderCartSalePrice,
  updateOrderCartItem,
} from '../utils/orderCart.js';

const PACKAGING_TYPES_DE = [
  'Sackware',
  'Siloware',
  'Big Bags',
  'Octa',
  'Andere',
  'NEUTRALE Sackware',
  'NEUTRALE Oktabins',
];

const PACKAGING_TYPES_EN = [
  'Bags',
  'Silo/bulk',
  'Big Bags',
  'Octabins',
  'Others',
  'NEUTRAL Bags',
  'NEUTRAL Octas',
];

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

export default function OrderCart() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [items, setItems] = React.useState(() => getOrderCartItems());
  const [error, setError] = React.useState('');
  const [incotermOptions, setIncotermOptions] = React.useState([]);
  const [paymentTextOptions, setPaymentTextOptions] = React.useState([]);
  const packagingOptions = React.useMemo(() => (lang === 'en' ? PACKAGING_TYPES_EN : PACKAGING_TYPES_DE), [lang]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [incRes, payRes] = await Promise.all([
          apiRequest('/temp-orders/incoterms'),
          apiRequest('/temp-orders/payment-texts'),
        ]);
        if (!alive) return;
        setIncotermOptions(Array.isArray(incRes?.data) ? incRes.data : []);
        setPaymentTextOptions(Array.isArray(payRes?.data) ? payRes.data : []);
      } catch {
        if (!alive) return;
        setIncotermOptions([]);
        setPaymentTextOptions([]);
      }
    })();
    return () => { alive = false; };
  }, []);

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
        messages.push(t('validation_cart_quantity_positive'));
        continue;
      }
      const available = Number(x.availableAmount);
      if (Number.isFinite(available) && qty > available) {
        messages.push(t('validation_cart_quantity_not_above_available'));
      }
      const salePrice = Number(x.salePrice);
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(t('validation_sale_price_positive'));
      }
      if (!x.deliveryDate) {
        messages.push(t('validation_delivery_date_required'));
      }
      if (!x.incotermId) {
        messages.push(t('validation_incoterm_required'));
      }
      if (!x.packagingType) {
        messages.push(t('validation_packaging_required'));
      }
      if (x.specialPaymentCondition && !x.specialPaymentId) {
        messages.push(t('validation_special_payment_text_required'));
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
                <TextField
                  type="date"
                  label={t('delivery_date')}
                  value={row.deliveryDate || ''}
                  onChange={(e) => setItems(updateOrderCartItem(row.id, { deliveryDate: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                />
                <TextField
                  label={t('delivery_address_label')}
                  value={row.deliveryAddress || ''}
                  onChange={(e) => setItems(updateOrderCartItem(row.id, { deliveryAddress: e.target.value }))}
                  size="small"
                />
                <TextField
                  select
                  label={t('incoterm_label')}
                  value={row.incotermId || ''}
                  onChange={(e) => {
                    const selectedId = Number(e.target.value);
                    const selected = incotermOptions.find((x) => Number(x.id) === selectedId);
                    setItems(updateOrderCartItem(row.id, {
                      incotermId: Number.isFinite(selectedId) ? selectedId : '',
                      incotermText: selected?.text || '',
                    }));
                  }}
                  size="small"
                >
                  {incotermOptions.map((x) => (
                    <MenuItem key={x.id} value={x.id}>{x.text}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label={t('packaging_type_label')}
                  value={row.packagingType || ''}
                  onChange={(e) => setItems(updateOrderCartItem(row.id, { packagingType: e.target.value }))}
                  size="small"
                >
                  {packagingOptions.map((x) => (
                    <MenuItem key={x} value={x}>{x}</MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={Boolean(row.specialPaymentCondition)}
                      onChange={(e) => setItems(updateOrderCartItem(row.id, {
                        specialPaymentCondition: e.target.checked,
                        ...(e.target.checked ? {} : { specialPaymentId: '', specialPaymentText: '' }),
                      }))}
                    />
                  )}
                  label={t('special_payment_condition')}
                />
                {Boolean(row.specialPaymentCondition) && (
                  <TextField
                    select
                    label={t('special_payment_text_label')}
                    value={row.specialPaymentId || ''}
                    onChange={(e) => {
                      const selectedId = Number(e.target.value);
                      const selected = paymentTextOptions.find((x) => Number(x.id) === selectedId);
                      setItems(updateOrderCartItem(row.id, {
                        specialPaymentId: Number.isFinite(selectedId) ? selectedId : '',
                        specialPaymentText: selected?.text || '',
                      }));
                    }}
                    size="small"
                  >
                    {paymentTextOptions.map((x) => (
                      <MenuItem key={x.id} value={x.id}>{x.text}</MenuItem>
                    ))}
                  </TextField>
                )}
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
                      specialPaymentCondition: Boolean(x.specialPaymentCondition),
                      specialPaymentText: x.specialPaymentText || '',
                      specialPaymentId: x.specialPaymentId === '' ? null : Number(x.specialPaymentId),
                      incotermText: x.incotermText || '',
                      incotermId: x.incotermId === '' ? null : Number(x.incotermId),
                      packagingType: x.packagingType || '',
                      deliveryDate: x.deliveryDate || '',
                      deliveryAddress: x.deliveryAddress || '',
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

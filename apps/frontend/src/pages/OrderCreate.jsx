import React from 'react';
import {
  Alert,
  Autocomplete,
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
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function OrderCreate() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const [productQuery, setProductQuery] = React.useState('');
  const [productOptions, setProductOptions] = React.useState([]);
  const [selectedProduct, setSelectedProduct] = React.useState(null);

  const [validationOpen, setValidationOpen] = React.useState(false);
  const [validationMessages, setValidationMessages] = React.useState([]);

  const [form, setForm] = React.useState({
    beNumber: '',
    warehouseId: '',
    amount: '',
    reservationEndDate: tomorrow(),
    comment: '',
  });

  const availableAmount = React.useMemo(() => {
    const total = Number(selectedProduct?.amount ?? 0);
    const reserved = Number(selectedProduct?.reserved ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(reserved)) return null;
    return Math.max(total - reserved, 0);
  }, [selectedProduct]);

  React.useEffect(() => {
    const h = setTimeout(async () => {
      const q = productQuery.trim();
      if (!q) {
        setProductOptions([]);
        return;
      }
      try {
        setLoading(true);
        const res = await apiRequest(`/products?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=article&dir=ASC`);
        setProductOptions(res?.data || []);
      } catch {
        setProductOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [productQuery]);

  const onChooseProduct = (product) => {
    setSelectedProduct(product);
    if (!product) return;
    setForm((prev) => ({
      ...prev,
      beNumber: String(product.beNumber || '').trim(),
      warehouseId: String(product.storageId || '').trim(),
    }));
  };

  const submit = async () => {
    const messages = [];
    const amount = Number(form.amount);
    if (!String(form.beNumber || '').trim() || !String(form.warehouseId || '').trim()) {
      messages.push(t('validation_product_required'));
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      messages.push(t('validation_reservation_positive'));
    }
    if (!form.reservationEndDate) {
      messages.push(t('validation_reservation_date_required'));
    }
    if (availableAmount !== null && Number.isFinite(amount) && amount > availableAmount) {
      messages.push(t('product_reserve_too_much'));
    }

    if (messages.length) {
      setValidationMessages(messages);
      setValidationOpen(true);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await apiRequest('/products/reserve', {
        method: 'POST',
        body: JSON.stringify({
          beNumber: form.beNumber,
          warehouseId: form.warehouseId,
          amount: Number(form.amount),
          reservationEndDate: form.reservationEndDate,
          comment: form.comment || '',
        }),
      });
      setSuccess(t('product_reserve_confirmed'));
      navigate('/orders');
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={() => navigate('/orders')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">{t('reservation_create_title')}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Autocomplete
            options={productOptions}
            value={selectedProduct}
            loading={loading}
            getOptionLabel={(opt) => String(opt?.article || '')}
            onChange={(e, value) => onChooseProduct(value)}
            inputValue={productQuery}
            onInputChange={(e, value) => setProductQuery(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('product_select')}
                fullWidth
              />
            )}
          />

          <TextField label={t('product_be_number')} value={form.beNumber} fullWidth disabled />
          <TextField label={t('product_storage_id')} value={form.warehouseId} fullWidth disabled />

          <TextField
            type="number"
            label={t('product_reserve_amount')}
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            fullWidth
            helperText={availableAmount !== null ? `${t('product_available_now')}: ${availableAmount} ${selectedProduct?.unit || ''}` : ''}
          />
          <TextField
            type="date"
            label={t('product_reserve_until')}
            value={form.reservationEndDate}
            onChange={(e) => setForm((p) => ({ ...p, reservationEndDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            multiline
            minRows={2}
            label={t('product_reserve_comment')}
            value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            fullWidth
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={submit} disabled={saving}>
              {t('product_reserve_submit')}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={validationOpen} onClose={() => setValidationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('validation_dialog_title')}</DialogTitle>
        <DialogContent>
          <Box component="ul" sx={{ my: 0, pl: 3 }}>
            {validationMessages.map((msg, idx) => (
              <li key={`${msg}-${idx}`}>
                <Typography variant="body2">{msg}</Typography>
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValidationOpen(false)}>{t('back_label')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


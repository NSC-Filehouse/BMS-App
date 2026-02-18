import React from 'react';
import {
  Alert,
  Autocomplete,
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
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { clearOrderCart } from '../utils/orderCart.js';

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';
  return [street, [plz, ort].filter(Boolean).join(' '), lk].filter(Boolean).join(', ');
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function inSevenDays() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function TempOrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const source = location.state?.source || null;
  const sourceItems = Array.isArray(location.state?.sourceItems) ? location.state.sourceItems : null;

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [validationOpen, setValidationOpen] = React.useState(false);
  const [validationMessages, setValidationMessages] = React.useState([]);

  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customerOptions, setCustomerOptions] = React.useState([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [productQuery, setProductQuery] = React.useState('');
  const [productOptions, setProductOptions] = React.useState([]);
  const [selectedProduct, setSelectedProduct] = React.useState(null);
  const [supplierQuery, setSupplierQuery] = React.useState('');
  const [supplierOptions, setSupplierOptions] = React.useState([]);
  const [selectedSupplier, setSelectedSupplier] = React.useState(null);

  const [form, setForm] = React.useState({
    beNumber: '',
    warehouseId: '',
    amountInKg: '',
    pricePerKg: '',
    reservationInKg: '',
    reservationDate: '',
    clientReferenceId: '',
    clientName: '',
    clientAddress: '',
    clientRepresentative: '',
    specialPaymentCondition: false,
    comment: '',
    supplier: '',
    deliveryType: 'LKW',
    packagingType: '',
    deliveryStartDate: tomorrow(),
    deliveryEndDate: inSevenDays(),
  });

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      if (isEdit) {
        try {
          setLoading(true);
          const res = await apiRequest(`/temp-orders/${encodeURIComponent(id)}`);
          if (!alive) return;
          const d = res?.data || {};
          setForm({
            beNumber: d.beNumber || '',
            warehouseId: d.warehouse || '',
            amountInKg: d.amountInKg ?? '',
            pricePerKg: d.price ?? '',
            reservationInKg: d.reservationInKg ?? '',
            reservationDate: d.reservationDate ? String(d.reservationDate).slice(0, 10) : '',
            clientReferenceId: d.clientReferenceId || '',
            clientName: d.clientName || '',
            clientAddress: d.clientAddress || '',
            clientRepresentative: d.clientRepresentative || '',
            specialPaymentCondition: Boolean(d.specialPaymentCondition),
            comment: d.comment || '',
            supplier: d.distributor || '',
            deliveryType: d.deliveryType || 'LKW',
            packagingType: d.packagingType || '',
            deliveryStartDate: d.deliveryStartDate ? String(d.deliveryStartDate).slice(0, 10) : tomorrow(),
            deliveryEndDate: d.deliveryEndDate ? String(d.deliveryEndDate).slice(0, 10) : inSevenDays(),
          });
          if (d.distributor) {
            setSupplierQuery(String(d.distributor));
          }
        } catch (e) {
          if (alive) setError(e?.message || t('loading_error'));
        } finally {
          if (alive) setLoading(false);
        }
        return;
      }

      if (!source?.beNumber || !source?.warehouseId) {
        if (Array.isArray(sourceItems) && sourceItems.length > 0) {
          const first = sourceItems[0];
          setForm((prev) => ({
            ...prev,
            beNumber: first.beNumber || '',
            warehouseId: first.warehouseId || '',
            amountInKg: first.amountInKg ?? '',
            pricePerKg: first.price ?? '',
          }));
        }
        return;
      }

      setForm((prev) => ({
        ...prev,
        beNumber: source.beNumber,
        warehouseId: source.warehouseId,
        amountInKg: source.amountInKg ?? source.reserveAmount ?? '',
        pricePerKg: source.price ?? '',
        reservationInKg: source.reserveAmount ?? '',
        reservationDate: source.reservationDate ? String(source.reservationDate).slice(0, 10) : '',
        comment: source.comment || '',
      }));
    };
    run();
    return () => { alive = false; };
  }, [id, isEdit, source, sourceItems, t]);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      const beNumber = String(form.beNumber || '').trim();
      if (!beNumber) return;
      try {
        const res = await apiRequest(`/temp-orders/meta/by-be-number/${encodeURIComponent(beNumber)}`);
        if (!alive) return;
        const meta = res?.data || {};
        setForm((prev) => ({
          ...prev,
          packagingType: String(meta.packagingType || '').trim(),
          deliveryType: String(meta.deliveryType || 'LKW').trim() || 'LKW',
        }));
      } catch {
        if (!alive) return;
        setForm((prev) => ({ ...prev, deliveryType: 'LKW' }));
      }
    };
    run();
    return () => { alive = false; };
  }, [form.beNumber]);

  React.useEffect(() => {
    if (isEdit || (source?.beNumber && source?.warehouseId)) return undefined;
    const h = setTimeout(async () => {
      const q = productQuery.trim();
      if (!q) {
        setProductOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/products?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=article&dir=ASC`);
        setProductOptions(res?.data || []);
      } catch {
        setProductOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [isEdit, productQuery, source?.beNumber, source?.warehouseId]);

  React.useEffect(() => {
    const h = setTimeout(async () => {
      const q = customerQuery.trim();
      if (!q) {
        setCustomerOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/customers?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=kd_Name1&dir=ASC`);
        setCustomerOptions(res?.data || []);
      } catch {
        setCustomerOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [customerQuery]);

  React.useEffect(() => {
    const h = setTimeout(async () => {
      const q = supplierQuery.trim();
      if (!q) {
        setSupplierOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/customers?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=kd_Name1&dir=ASC`);
        setSupplierOptions(res?.data || []);
      } catch {
        setSupplierOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [supplierQuery]);

  const onChooseProduct = (product) => {
    setSelectedProduct(product);
    if (!product) return;
    setForm((prev) => ({
      ...prev,
      beNumber: String(product.beNumber || '').trim(),
      warehouseId: String(product.storageId || '').trim(),
      amountInKg: product.amount ?? '',
      pricePerKg: product.acquisitionPrice ?? '',
    }));
  };

  const onChooseCustomer = async (customer) => {
    setSelectedCustomer(customer);
    if (!customer) return;

    const clientReferenceId = String(customer.kd_KdNR || '').trim();
    const clientName = String(customer.kd_Name1 || customer.kd_Name2 || '').trim();
    const clientAddress = buildAddress(customer);

    setForm((prev) => ({
      ...prev,
      clientReferenceId,
      clientName,
      clientAddress,
      clientRepresentative: '',
    }));

    try {
      const detail = await apiRequest(`/customers/${encodeURIComponent(clientReferenceId)}`);
      const reps = Array.isArray(detail?.data?.representatives) ? detail.data.representatives : [];
      if (reps.length > 0) {
        setForm((prev) => ({ ...prev, clientRepresentative: reps[0].name || '' }));
      }
    } catch {}
  };

  const onChooseSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    const supplierName = String(supplier?.kd_Name1 || supplier?.kd_Name2 || supplier?.kd_KdNR || '').trim();
    setForm((prev) => ({ ...prev, supplier: supplierName }));
  };

  const submit = async () => {
    const messages = [];
    const amount = Number(form.amountInKg);
    const price = Number(form.pricePerKg);
    const reservation = form.reservationInKg === '' ? null : Number(form.reservationInKg);

    if (!form.clientReferenceId) messages.push(t('validation_customer_required'));
    if (!Array.isArray(sourceItems) && (!String(form.beNumber || '').trim() || !String(form.warehouseId || '').trim())) {
      messages.push(t('validation_product_required'));
    }
    if (!String(form.clientName || '').trim()) messages.push(t('validation_customer_name_required'));
    if (!String(form.clientAddress || '').trim()) messages.push(t('validation_customer_address_required'));
    if (!String(form.supplier || '').trim()) messages.push(t('validation_supplier_required'));

    if (!Number.isFinite(amount) || amount <= 0) {
      messages.push(t('validation_amount_positive'));
    }
    if (!Number.isFinite(price) || price <= 0) {
      messages.push(t('validation_price_positive'));
    }

    if (reservation !== null) {
      if (!Number.isFinite(reservation) || reservation <= 0) {
        messages.push(t('validation_reservation_positive'));
      }
      if (Number.isFinite(amount) && Number.isFinite(reservation) && reservation > amount) {
        messages.push(t('validation_reservation_not_above_amount'));
      }
      if (!form.reservationDate) {
        messages.push(t('validation_reservation_date_required'));
      }
    }

    const start = new Date(form.deliveryStartDate);
    const end = new Date(form.deliveryEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      messages.push(t('validation_delivery_dates_required'));
    } else if (start.getTime() > end.getTime()) {
      messages.push(t('validation_delivery_range_invalid'));
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
      const payload = {
        beNumber: form.beNumber,
        warehouseId: form.warehouseId,
        amountInKg: Number(form.amountInKg),
        pricePerKg: Number(form.pricePerKg),
        reservationInKg: form.reservationInKg === '' ? null : Number(form.reservationInKg),
        reservationDate: form.reservationDate || null,
        clientReferenceId: form.clientReferenceId,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        clientRepresentative: form.clientRepresentative || null,
        specialPaymentCondition: Boolean(form.specialPaymentCondition),
        comment: form.comment || null,
        supplier: form.supplier || null,
        deliveryStartDate: form.deliveryStartDate,
        deliveryEndDate: form.deliveryEndDate,
      };
      if (Array.isArray(sourceItems) && sourceItems.length > 0) {
        payload.positions = sourceItems.map((x) => ({
          beNumber: x.beNumber,
          warehouseId: x.warehouseId,
          amountInKg: Number(x.amountInKg),
          pricePerKg: Number(x.price),
          reservationInKg: null,
          reservationDate: null,
        }));
      }

      const res = isEdit
        ? await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiRequest('/temp-orders', { method: 'POST', body: JSON.stringify(payload) });

      setSuccess(t('temp_order_saved'));
      const newId = res?.data?.id;
      if (newId) {
        if (Array.isArray(sourceItems) && sourceItems.length > 0) clearOrderCart();
        navigate(`/temp-orders/${encodeURIComponent(newId)}`);
      } else {
        navigate('/temp-orders');
      }
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton aria-label="back" onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">{isEdit ? t('temp_order_edit_title') : t('temp_order_create_title')}</Typography>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!loading && (
        <Card>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!isEdit && !(source?.beNumber && source?.warehouseId) && !Array.isArray(sourceItems) && (
              <Autocomplete
                options={productOptions}
                value={selectedProduct}
                getOptionLabel={(opt) => String(opt?.article || '')}
                onChange={(e, value) => onChooseProduct(value)}
                inputValue={productQuery}
                onInputChange={(e, value) => setProductQuery(value)}
                renderInput={(params) => <TextField {...params} label={t('product_select')} fullWidth />}
              />
            )}
            <TextField label={t('product_be_number')} value={form.beNumber} fullWidth disabled />
            <TextField label={t('product_storage_id')} value={form.warehouseId} fullWidth disabled />
            {Array.isArray(sourceItems) && sourceItems.length > 0 && (
              <TextField label={t('order_positions_count')} value={sourceItems.length} fullWidth disabled />
            )}

            <Autocomplete
              options={customerOptions}
              value={selectedCustomer}
              getOptionLabel={(opt) => String(opt?.kd_Name1 || opt?.kd_Name2 || opt?.kd_KdNR || '')}
              onChange={(e, value) => onChooseCustomer(value)}
              inputValue={customerQuery}
              onInputChange={(e, value) => setCustomerQuery(value)}
              renderInput={(params) => <TextField {...params} label={t('customer_select')} fullWidth />}
            />

            <TextField label={t('order_customer')} value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} fullWidth />
            <TextField label={t('address_label')} value={form.clientAddress} fullWidth disabled />
            <TextField label={t('contact_label')} value={form.clientRepresentative} fullWidth disabled />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField type="number" label={t('product_amount')} value={form.amountInKg} onChange={(e) => setForm((p) => ({ ...p, amountInKg: e.target.value }))} fullWidth />
              <TextField type="number" label={t('product_price')} value={form.pricePerKg} onChange={(e) => setForm((p) => ({ ...p, pricePerKg: e.target.value }))} fullWidth />
              <TextField type="number" label={t('order_reserve_amount')} value={form.reservationInKg} onChange={(e) => setForm((p) => ({ ...p, reservationInKg: e.target.value }))} fullWidth />
              <TextField type="date" label={t('order_reserved_until')} value={form.reservationDate} onChange={(e) => setForm((p) => ({ ...p, reservationDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField type="date" label={t('delivery_start')} value={form.deliveryStartDate} onChange={(e) => setForm((p) => ({ ...p, deliveryStartDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField type="date" label={t('delivery_end')} value={form.deliveryEndDate} onChange={(e) => setForm((p) => ({ ...p, deliveryEndDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            </Box>

            <Autocomplete
              options={supplierOptions}
              value={selectedSupplier}
              getOptionLabel={(opt) => String(opt?.kd_Name1 || opt?.kd_Name2 || opt?.kd_KdNR || '')}
              onChange={(e, value) => onChooseSupplier(value)}
              inputValue={supplierQuery}
              onInputChange={(e, value) => setSupplierQuery(value)}
              renderInput={(params) => <TextField {...params} label={t('supplier_select')} fullWidth />}
            />
            <TextField label={t('delivery_type_label')} value={form.deliveryType} fullWidth disabled />
            <TextField label={t('packaging_type_label')} value={form.packagingType} fullWidth disabled />
            <FormControlLabel
              control={<Checkbox checked={Boolean(form.specialPaymentCondition)} onChange={(e) => setForm((p) => ({ ...p, specialPaymentCondition: e.target.checked }))} />}
              label={t('special_payment_condition')}
            />
            <TextField multiline minRows={3} label={t('order_comment')} value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} fullWidth />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={submit} disabled={saving}>
                {t('save_label')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

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

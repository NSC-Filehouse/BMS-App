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
  FormControlLabel,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

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

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customerOptions, setCustomerOptions] = React.useState([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [representatives, setRepresentatives] = React.useState([]);

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
            packagingType: d.packagingType || '',
            deliveryStartDate: d.deliveryStartDate ? String(d.deliveryStartDate).slice(0, 10) : tomorrow(),
            deliveryEndDate: d.deliveryEndDate ? String(d.deliveryEndDate).slice(0, 10) : inSevenDays(),
          });
        } catch (e) {
          if (alive) setError(e?.message || t('loading_error'));
        } finally {
          if (alive) setLoading(false);
        }
        return;
      }

      if (!source?.beNumber || !source?.warehouseId) {
        setError('Missing source data for new order.');
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
  }, [id, isEdit, source, t]);

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
      setRepresentatives(reps);
      if (reps.length === 1) {
        setForm((prev) => ({ ...prev, clientRepresentative: reps[0].name || '' }));
      }
    } catch {
      setRepresentatives([]);
    }
  };

  const submit = async () => {
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
        packagingType: form.packagingType || null,
        deliveryStartDate: form.deliveryStartDate,
        deliveryEndDate: form.deliveryEndDate,
      };

      const res = isEdit
        ? await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiRequest('/temp-orders', { method: 'POST', body: JSON.stringify(payload) });

      setSuccess(t('temp_order_saved'));
      const newId = res?.data?.id;
      if (newId) {
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
            <TextField label={t('product_be_number')} value={form.beNumber} fullWidth disabled />
            <TextField label={t('product_storage_id')} value={form.warehouseId} fullWidth disabled />

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
            <TextField label={t('address_label')} value={form.clientAddress} onChange={(e) => setForm((p) => ({ ...p, clientAddress: e.target.value }))} fullWidth />

            {representatives.length > 0 ? (
              <Autocomplete
                options={representatives}
                value={representatives.find((x) => x.name === form.clientRepresentative) || null}
                getOptionLabel={(opt) => String(opt?.name || '')}
                onChange={(e, value) => setForm((p) => ({ ...p, clientRepresentative: value?.name || '' }))}
                renderInput={(params) => <TextField {...params} label={t('contact_label')} fullWidth />}
              />
            ) : (
              <TextField label={t('contact_label')} value={form.clientRepresentative} onChange={(e) => setForm((p) => ({ ...p, clientRepresentative: e.target.value }))} fullWidth />
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField type="number" label={t('product_amount')} value={form.amountInKg} onChange={(e) => setForm((p) => ({ ...p, amountInKg: e.target.value }))} fullWidth />
              <TextField type="number" label={t('product_price')} value={form.pricePerKg} onChange={(e) => setForm((p) => ({ ...p, pricePerKg: e.target.value }))} fullWidth />
              <TextField type="number" label={t('order_reserve_amount')} value={form.reservationInKg} onChange={(e) => setForm((p) => ({ ...p, reservationInKg: e.target.value }))} fullWidth />
              <TextField type="date" label={t('order_reserved_until')} value={form.reservationDate} onChange={(e) => setForm((p) => ({ ...p, reservationDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField type="date" label={t('delivery_start')} value={form.deliveryStartDate} onChange={(e) => setForm((p) => ({ ...p, deliveryStartDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField type="date" label={t('delivery_end')} value={form.deliveryEndDate} onChange={(e) => setForm((p) => ({ ...p, deliveryEndDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            </Box>

            <TextField label={t('product_supplier')} value={form.packagingType} onChange={(e) => setForm((p) => ({ ...p, packagingType: e.target.value }))} fullWidth />
            <FormControlLabel
              control={<Checkbox checked={Boolean(form.specialPaymentCondition)} onChange={(e) => setForm((p) => ({ ...p, specialPaymentCondition: e.target.checked }))} />}
              label={t('special_payment_condition')}
            />
            <TextField multiline minRows={3} label={t('order_comment')} value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} fullWidth />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={submit} disabled={saving || !form.clientReferenceId || !form.clientName || !form.clientAddress || !form.amountInKg || !form.pricePerKg || !form.deliveryStartDate || !form.deliveryEndDate}>
                {t('save_label')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

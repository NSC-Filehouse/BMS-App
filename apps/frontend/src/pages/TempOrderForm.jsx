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
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
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

export default function TempOrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();

  const source = location.state?.source || null;
  const sourceItems = Array.isArray(location.state?.sourceItems) ? location.state.sourceItems : null;
  const isCartCreate = !isEdit && Array.isArray(sourceItems) && sourceItems.length > 0;
  const isPositionsMode = isEdit || isCartCreate;

  React.useEffect(() => {
    if (!isEdit && !isCartCreate) {
      navigate('/order-cart', { replace: true });
    }
  }, [isEdit, isCartCreate, navigate]);

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [validationOpen, setValidationOpen] = React.useState(false);
  const [validationMessages, setValidationMessages] = React.useState([]);
  const [deleteLastConfirmOpen, setDeleteLastConfirmOpen] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState(false);

  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customerOptions, setCustomerOptions] = React.useState([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [positions, setPositions] = React.useState([]);
  const [paymentTextOptions, setPaymentTextOptions] = React.useState([]);
  const [incotermOptions, setIncotermOptions] = React.useState([]);
  const [addPosOpen, setAddPosOpen] = React.useState(false);
  const [addPosQuery, setAddPosQuery] = React.useState('');
  const [addPosOptions, setAddPosOptions] = React.useState([]);
  const [addPosProduct, setAddPosProduct] = React.useState(null);
  const [addPosQty, setAddPosQty] = React.useState('');

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
    specialPaymentText: '',
    specialPaymentId: '',
    incotermText: '',
    incotermId: '',
    comment: '',
    supplier: '',
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
            specialPaymentText: d.specialPaymentText || '',
            specialPaymentId: d.specialPaymentId ?? '',
            incotermText: d.incotermText || d.deliveryType || '',
            incotermId: d.incotermId ?? d.deliveryTypeId ?? '',
            comment: d.comment || '',
            supplier: d.distributor || '',
            packagingType: d.packagingType || '',
            deliveryStartDate: d.deliveryStartDate ? String(d.deliveryStartDate).slice(0, 10) : tomorrow(),
            deliveryEndDate: d.deliveryEndDate ? String(d.deliveryEndDate).slice(0, 10) : inSevenDays(),
          });
          const loadedPositions = Array.isArray(d.positions) ? d.positions : [];
          setPositions(loadedPositions.map((p) => ({
            id: p.id,
            beNumber: p.beNumber,
            warehouseId: p.warehouse || p.warehouseId,
            article: p.article,
            amountInKg: p.amountInKg,
            price: p.price,
            reservationInKg: p.reservationInKg,
            reservationDate: p.reservationDate,
          })));
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
          setPositions(sourceItems.map((x, idx) => ({
            id: x.id || `${x.beNumber || 'pos'}-${idx}`,
            beNumber: x.beNumber,
            warehouseId: x.warehouseId,
            article: x.article,
            amountInKg: x.amountInKg,
            price: x.price,
            reservationInKg: null,
            reservationDate: null,
          })));
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
      try {
        const res = await apiRequest('/temp-orders/payment-texts');
        if (!alive) return;
        setPaymentTextOptions(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!alive) return;
        setPaymentTextOptions([]);
      }
    };
    run();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await apiRequest('/temp-orders/incoterms');
        if (!alive) return;
        setIncotermOptions(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!alive) return;
        setIncotermOptions([]);
      }
    };
    run();
    return () => { alive = false; };
  }, []);

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
        }));
      } catch {}
    };
    run();
    return () => { alive = false; };
  }, [form.beNumber]);

  React.useEffect(() => {
    if (!addPosOpen) return undefined;
    const h = setTimeout(async () => {
      const q = addPosQuery.trim();
      if (!q) {
        setAddPosOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/products?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=article&dir=ASC`);
        setAddPosOptions(res?.data || []);
      } catch {
        setAddPosOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [addPosOpen, addPosQuery]);

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
      if (reps.length > 0) {
        setForm((prev) => ({ ...prev, clientRepresentative: reps[0].name || '' }));
      }
    } catch {}
  };

  const deleteOrder = React.useCallback(async () => {
    if (!isEdit || !id) return;
    try {
      setDeletingOrder(true);
      setError('');
      setSuccess('');
      await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSuccess(t('temp_order_deleted'));
      navigate('/temp-orders');
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setDeletingOrder(false);
      setDeleteLastConfirmOpen(false);
    }
  }, [id, isEdit, navigate, t]);

  const onRemovePosition = React.useCallback((idx) => {
    if (!Array.isArray(positions) || idx < 0 || idx >= positions.length) return;
    const isLastPosition = positions.length === 1;
    if (isLastPosition && isEdit) {
      setDeleteLastConfirmOpen(true);
      return;
    }
    setPositions((prev) => prev.filter((_, i) => i !== idx));
  }, [isEdit, positions]);

  const submit = async () => {
    const messages = [];
    const amount = Number(form.amountInKg);
    const price = Number(form.pricePerKg);
    const reservation = form.reservationInKg === '' ? null : Number(form.reservationInKg);

    if (!form.clientReferenceId) messages.push(t('validation_customer_required'));
    if ((isEdit || isCartCreate) && (!Array.isArray(positions) || positions.length === 0)) {
      messages.push('Mindestens eine Position muss vorhanden sein.');
    }
    if (!String(form.clientName || '').trim()) messages.push(t('validation_customer_name_required'));
    if (!String(form.clientAddress || '').trim()) messages.push(t('validation_customer_address_required'));
    if (form.specialPaymentCondition && !Number(form.specialPaymentId)) {
      messages.push(t('validation_special_payment_text_required'));
    }

    if (!isPositionsMode) {
      if (!Number.isFinite(amount) || amount <= 0) {
        messages.push(t('validation_amount_positive'));
      }
      if (!Number.isFinite(price) || price <= 0) {
        messages.push(t('validation_price_positive'));
      }
    }

    if (!isPositionsMode && reservation !== null) {
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
        specialPaymentText: form.specialPaymentText || null,
        specialPaymentId: form.specialPaymentId === '' ? null : Number(form.specialPaymentId),
        incotermText: form.incotermText || null,
        incotermId: form.incotermId === '' ? null : Number(form.incotermId),
        comment: form.comment || null,
        supplier: form.supplier || null,
        packagingType: form.packagingType || '',
        deliveryStartDate: form.deliveryStartDate,
        deliveryEndDate: form.deliveryEndDate,
      };
      if ((isEdit || isCartCreate) && Array.isArray(positions) && positions.length > 0) {
        payload.positions = positions.map((x) => ({
          beNumber: x.beNumber,
          warehouseId: x.warehouseId,
          amountInKg: Number(x.amountInKg),
          pricePerKg: Number(x.price),
          reservationInKg: x.reservationInKg === null || x.reservationInKg === undefined ? null : Number(x.reservationInKg),
          reservationDate: x.reservationDate || null,
        }));
        payload.beNumber = payload.positions[0].beNumber;
        payload.warehouseId = payload.positions[0].warehouseId;
        payload.amountInKg = payload.positions[0].amountInKg;
        payload.pricePerKg = payload.positions[0].pricePerKg;
        payload.reservationInKg = payload.positions[0].reservationInKg;
        payload.reservationDate = payload.positions[0].reservationDate;
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

            {(
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  {!isPositionsMode && <TextField type="number" label={t('product_amount')} value={form.amountInKg} onChange={(e) => setForm((p) => ({ ...p, amountInKg: e.target.value }))} fullWidth />}
                  {!isPositionsMode && <TextField type="number" label={t('product_price')} value={form.pricePerKg} onChange={(e) => setForm((p) => ({ ...p, pricePerKg: e.target.value }))} fullWidth />}
                  {!isPositionsMode && (
                    <TextField type="number" label={t('order_reserve_amount')} value={form.reservationInKg} onChange={(e) => setForm((p) => ({ ...p, reservationInKg: e.target.value }))} fullWidth />
                  )}
                  {!isPositionsMode && <TextField type="date" label={t('order_reserved_until')} value={form.reservationDate} onChange={(e) => setForm((p) => ({ ...p, reservationDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />}
                  <TextField type="date" label={t('delivery_start')} value={form.deliveryStartDate} onChange={(e) => setForm((p) => ({ ...p, deliveryStartDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth disabled={isPositionsMode} />
                  <TextField type="date" label={t('delivery_end')} value={form.deliveryEndDate} onChange={(e) => setForm((p) => ({ ...p, deliveryEndDate: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth disabled={isPositionsMode} />
                </Box>

                <TextField
                  select
                  label={t('incoterm_label')}
                  value={form.incotermId}
                  onChange={(e) => {
                    const selectedId = Number(e.target.value);
                    const selected = incotermOptions.find((x) => Number(x.id) === selectedId);
                    setForm((p) => ({
                      ...p,
                      incotermId: Number.isFinite(selectedId) ? selectedId : '',
                      incotermText: selected?.text || '',
                    }));
                  }}
                  fullWidth
                >
                  {incotermOptions.map((x) => (
                    <MenuItem key={x.id} value={x.id}>{x.text}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label={t('packaging_type_label')}
                  value={form.packagingType}
                  onChange={(e) => setForm((p) => ({ ...p, packagingType: e.target.value }))}
                  fullWidth
                >
                  {(lang === 'en' ? PACKAGING_TYPES_EN : PACKAGING_TYPES_DE).map((x) => (
                    <MenuItem key={x} value={x}>{x}</MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={<Checkbox checked={Boolean(form.specialPaymentCondition)} onChange={(e) => setForm((p) => ({
                    ...p,
                    specialPaymentCondition: e.target.checked,
                    ...(e.target.checked ? {} : { specialPaymentText: '', specialPaymentId: '' }),
                  }))} />}
                  label={t('special_payment_condition')}
                />
                {Boolean(form.specialPaymentCondition) && (
                  <TextField
                    select
                    label={t('special_payment_text_label')}
                    value={form.specialPaymentId}
                    onChange={(e) => {
                      const selectedId = Number(e.target.value);
                      const selected = paymentTextOptions.find((x) => Number(x.id) === selectedId);
                      setForm((p) => ({
                        ...p,
                        specialPaymentId: Number.isFinite(selectedId) ? selectedId : '',
                        specialPaymentText: selected?.text || '',
                      }));
                    }}
                    fullWidth
                  >
                    {paymentTextOptions.map((x) => (
                      <MenuItem key={x.id} value={x.id}>{x.text}</MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField multiline minRows={3} label={t('order_comment')} value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} fullWidth />
              </>
            )}

            {isPositionsMode && (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                  <Typography variant="subtitle2">
                    {t('order_positions_count')}: {positions.length}
                  </Typography>
                  {isEdit && (
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="add-position"
                      onClick={() => {
                        setAddPosOpen(true);
                        setAddPosQuery('');
                        setAddPosOptions([]);
                        setAddPosProduct(null);
                        setAddPosQty('');
                      }}
                    >
                      <AddCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {positions.map((x, idx) => (
                    <Box
                      key={`${x.id || x.beNumber || idx}-${idx}`}
                      sx={{
                        border: '1px solid rgba(0,0,0,0.12)',
                        borderRadius: 1.5,
                        p: 1.25,
                        display: 'grid',
                        gap: 0.25,
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {x.article || '-'}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.75 }}>
                        {t('product_be_number')}: {x.beNumber || '-'} | {t('product_storage_id')}: {x.warehouseId || '-'}
                      </Typography>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onRemovePosition(idx)}
                        sx={{ justifySelf: 'end' }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="caption" sx={{ opacity: 0.75 }}>
                        {t('product_amount')}: {x.amountInKg ?? '-'} kg | {t('product_price')}: {x.price ?? '-'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={submit} disabled={saving || deletingOrder}>
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

      <Dialog open={deleteLastConfirmOpen} onClose={() => (!deletingOrder ? setDeleteLastConfirmOpen(false) : undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{t('temp_order_delete_last_position_title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('temp_order_delete_last_position_text')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLastConfirmOpen(false)} disabled={deletingOrder}>{t('back_label')}</Button>
          <Button color="error" variant="contained" onClick={deleteOrder} disabled={deletingOrder}>
            {t('delete_label')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addPosOpen} onClose={() => setAddPosOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('product_select')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          <Autocomplete
            options={addPosOptions}
            value={addPosProduct}
            getOptionLabel={(opt) => String(opt?.article || '')}
            onChange={(e, value) => setAddPosProduct(value)}
            inputValue={addPosQuery}
            onInputChange={(e, value) => setAddPosQuery(value)}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                <Typography variant="body2">{String(option?.article || '')}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  ({t('product_warehouse')}: {String(option?.warehouse || '-')})
                </Typography>
              </Box>
            )}
            renderInput={(params) => <TextField {...params} label={t('product_select')} fullWidth />}
          />
          <TextField
            type="number"
            label={t('product_amount')}
            value={addPosQty}
            onChange={(e) => setAddPosQty(e.target.value)}
            inputProps={{ min: 1, step: 'any' }}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPosOpen(false)}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(addPosQty);
              const product = addPosProduct;
              if (!product) {
                setError(t('validation_product_required'));
                return;
              }
              if (!Number.isFinite(qty) || qty <= 0) {
                setError(t('validation_amount_positive'));
                return;
              }
              const price = Number(product.acquisitionPrice);
              if (!Number.isFinite(price) || price <= 0) {
                setError(t('validation_price_positive'));
                return;
              }
              setPositions((prev) => ([
                ...prev,
                {
                  id: `${String(product.beNumber || 'pos')}-${String(product.storageId || '')}-${Date.now()}`,
                  beNumber: String(product.beNumber || '').trim(),
                  warehouseId: String(product.storageId || '').trim(),
                  article: product.article,
                  amountInKg: qty,
                  price,
                  reservationInKg: null,
                  reservationDate: null,
                },
              ]));
              setAddPosOpen(false);
            }}
          >
            {t('save_label')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

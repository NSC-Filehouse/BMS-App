import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
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

function createPositionDefaults(overrides = {}) {
  return {
    specialPaymentCondition: false,
    specialPaymentText: '',
    specialPaymentId: '',
    incotermText: '',
    incotermId: '',
    packagingType: '',
    deliveryDate: tomorrow(),
    deliveryAddress: '',
    deliveryAddressManual: false,
    wpzId: null,
    wpzOriginal: true,
    wpzComment: '',
    ...overrides,
  };
}

function formatDeliveryAddressParts(addr) {
  const text = String(addr?.text || '').trim();
  const primary = [String(addr?.name1 || '').trim(), String(addr?.name2 || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!text) {
    return { primary: primary || '-', secondary: '' };
  }
  const parts = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (!primary) {
    return {
      primary: parts[0] || text,
      secondary: parts.slice(1).join(', '),
    };
  }
  const lowerPrimary = primary.toLowerCase();
  const secondaryFromText = text.toLowerCase().startsWith(`${lowerPrimary},`)
    ? text.slice(primary.length + 1).trim()
    : parts.slice(1).join(', ');
  return { primary, secondary: secondaryFromText };
}

function renderDeliveryAddressOption(addr) {
  const { primary, secondary } = formatDeliveryAddressParts(addr);
  return (
    <Box sx={{ display: 'grid', minWidth: 0, width: '100%' }}>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {primary}
      </Typography>
      {secondary && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {secondary}
        </Typography>
      )}
    </Box>
  );
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
  const [deliveryAddressOptions, setDeliveryAddressOptions] = React.useState([]);
  const [paymentTextOptions, setPaymentTextOptions] = React.useState([]);
  const [incotermOptions, setIncotermOptions] = React.useState([]);
  const [addPosOpen, setAddPosOpen] = React.useState(false);
  const [addPosQuery, setAddPosQuery] = React.useState('');
  const [addPosOptions, setAddPosOptions] = React.useState([]);
  const [addPosProduct, setAddPosProduct] = React.useState(null);
  const [addPosQty, setAddPosQty] = React.useState('');
  const [addPosSalePrice, setAddPosSalePrice] = React.useState('');
  const [addPosError, setAddPosError] = React.useState('');
  const [addPosDeliveryDate, setAddPosDeliveryDate] = React.useState(tomorrow());
  const [addPosDeliveryAddress, setAddPosDeliveryAddress] = React.useState('');
  const [addPosDeliveryAddressManual, setAddPosDeliveryAddressManual] = React.useState(false);
  const [addPosPackagingType, setAddPosPackagingType] = React.useState('');
  const [addPosIncotermId, setAddPosIncotermId] = React.useState('');
  const [addPosIncotermText, setAddPosIncotermText] = React.useState('');
  const [addPosSpecialPaymentCondition, setAddPosSpecialPaymentCondition] = React.useState(false);
  const [addPosSpecialPaymentId, setAddPosSpecialPaymentId] = React.useState('');
  const [addPosSpecialPaymentText, setAddPosSpecialPaymentText] = React.useState('');
  const [addPosWpzId, setAddPosWpzId] = React.useState(null);
  const [addPosWpzOriginal, setAddPosWpzOriginal] = React.useState(true);
  const [addPosWpzComment, setAddPosWpzComment] = React.useState('');
  const addPosOptionsWithSelection = React.useMemo(() => {
    if (!addPosProduct) return addPosOptions;
    const exists = addPosOptions.some((x) => String(x?.id || '') === String(addPosProduct?.id || ''));
    return exists ? addPosOptions : [addPosProduct, ...addPosOptions];
  }, [addPosOptions, addPosProduct]);
  const addPosAvailableAmount = React.useMemo(() => {
    const total = Number(addPosProduct?.amount);
    const reserved = Number(addPosProduct?.reserved);
    if (!Number.isFinite(total)) return null;
    if (!Number.isFinite(reserved)) return total;
    return Math.max(total - reserved, 0);
  }, [addPosProduct]);

  const [form, setForm] = React.useState({
    clientReferenceId: '',
    clientName: '',
    clientAddress: '',
    clientRepresentative: '',
    comment: '',
    supplier: '',
  });
  const packagingOptions = React.useMemo(() => (lang === 'en' ? PACKAGING_TYPES_EN : PACKAGING_TYPES_DE), [lang]);
  const loadDeliveryAddresses = React.useCallback(async (clientReferenceId) => {
    const id = String(clientReferenceId || '').trim();
    if (!id) {
      setDeliveryAddressOptions([]);
      return [];
    }
    try {
      const res = await apiRequest(`/customers/${encodeURIComponent(id)}/delivery-addresses`);
      const list = Array.isArray(res?.data) ? res.data : [];
      setDeliveryAddressOptions(list);
      return list;
    } catch {
      setDeliveryAddressOptions([]);
      return [];
    }
  }, []);

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
            clientReferenceId: d.clientReferenceId || '',
            clientName: d.clientName || '',
            clientAddress: d.clientAddress || '',
            clientRepresentative: d.clientRepresentative || '',
            comment: d.comment || '',
            supplier: d.distributor || '',
          });
          await loadDeliveryAddresses(d.clientReferenceId || '');
          const loadedPositions = Array.isArray(d.positions) ? d.positions : [];
          setPositions(loadedPositions.map((p) => ({
            id: p.id,
            beNumber: p.beNumber,
            warehouseId: p.warehouse || p.warehouseId,
            article: p.article,
            amountInKg: p.amountInKg,
            price: p.price,
            costPrice: p.costPrice ?? null,
            reservationInKg: p.reservationInKg,
            reservationDate: p.reservationDate,
            ...createPositionDefaults({
              specialPaymentCondition: Boolean(p.specialPaymentCondition),
              specialPaymentText: p.specialPaymentText || '',
              specialPaymentId: p.specialPaymentId ?? '',
              incotermText: p.deliveryType || p.incotermText || '',
              incotermId: p.deliveryTypeId ?? p.incotermId ?? '',
              packagingType: p.packagingType || '',
              deliveryDate: p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : tomorrow(),
              deliveryAddress: p.deliveryAddress || '',
              deliveryAddressManual: false,
              wpzId: p.wpzId ?? null,
              wpzOriginal: p.wpzOriginal ?? true,
              wpzComment: p.wpzComment || '',
            }),
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
          setPositions(sourceItems.map((x, idx) => ({
            id: x.id || `${x.beNumber || 'pos'}-${idx}`,
            beNumber: x.beNumber,
            warehouseId: x.warehouseId,
            article: x.article,
            amountInKg: x.amountInKg,
            price: x.salePrice ?? x.price,
            costPrice: x.costPrice ?? x.price,
            reservationInKg: null,
            reservationDate: null,
            ...createPositionDefaults({
              specialPaymentCondition: Boolean(x.specialPaymentCondition),
              specialPaymentText: x.specialPaymentText || '',
              specialPaymentId: x.specialPaymentId ?? '',
              incotermText: x.incotermText || '',
              incotermId: x.incotermId ?? '',
              packagingType: x.packagingType || '',
              deliveryDate: x.deliveryDate || tomorrow(),
              deliveryAddress: x.deliveryAddress || '',
              deliveryAddressManual: false,
              wpzId: x.wpzId ?? null,
              wpzOriginal: x.wpzOriginal ?? true,
              wpzComment: x.wpzComment || '',
            }),
          })));
        }
        return;
      }

      setForm((prev) => ({
        ...prev,
        comment: source.comment || '',
      }));
    };
    run();
    return () => { alive = false; };
  }, [id, isEdit, source, sourceItems, t, loadDeliveryAddresses]);

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
    if (!customer) {
      setDeliveryAddressOptions([]);
      return;
    }

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
    await loadDeliveryAddresses(clientReferenceId);

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
    if (!form.clientReferenceId) messages.push(t('validation_customer_required'));
    if ((isEdit || isCartCreate) && (!Array.isArray(positions) || positions.length === 0)) {
      messages.push('Mindestens eine Position muss vorhanden sein.');
    }
    if (!String(form.clientName || '').trim()) messages.push(t('validation_customer_name_required'));
    if (!String(form.clientAddress || '').trim()) messages.push(t('validation_customer_address_required'));

    for (const pos of (Array.isArray(positions) ? positions : [])) {
      const amount = Number(pos.amountInKg);
      const salePrice = Number(pos.price);
      const costPrice = Number(pos.costPrice);
      if (!Number.isFinite(amount) || amount <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_amount_positive')}`);
      }
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_sale_price_positive')}`);
      }
      if (!Number.isFinite(costPrice) || costPrice <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_price_positive')}`);
      }
      if (!pos.deliveryDate) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_delivery_date_required')}`);
      }
      if (!String(pos.deliveryAddress || '').trim()) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_delivery_address_required')}`);
      }
      if (!pos.incotermId) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_incoterm_required')}`);
      }
      if (!pos.packagingType) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_packaging_required')}`);
      }
      if (pos.specialPaymentCondition && !pos.specialPaymentId) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_special_payment_text_required')}`);
      }
      if (pos.wpzId && !pos.wpzOriginal && !String(pos.wpzComment || '').trim()) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_wpz_comment_required')}`);
      }
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
        clientReferenceId: form.clientReferenceId,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        clientRepresentative: form.clientRepresentative || null,
        comment: form.comment || null,
        supplier: form.supplier || null,
      };
      if ((isEdit || isCartCreate) && Array.isArray(positions) && positions.length > 0) {
        payload.positions = positions.map((x) => ({
          beNumber: x.beNumber,
          warehouseId: x.warehouseId,
          amountInKg: Number(x.amountInKg),
          salePricePerKg: Number(x.price),
          costPricePerKg: Number(x.costPrice ?? x.price),
          reservationInKg: x.reservationInKg === null || x.reservationInKg === undefined ? null : Number(x.reservationInKg),
          reservationDate: x.reservationDate || null,
          specialPaymentCondition: Boolean(x.specialPaymentCondition),
          specialPaymentText: x.specialPaymentText || null,
          specialPaymentId: x.specialPaymentId === '' ? null : Number(x.specialPaymentId),
          incotermText: x.incotermText || null,
          incotermId: x.incotermId === '' ? null : Number(x.incotermId),
          packagingType: x.packagingType || '',
          deliveryDate: x.deliveryDate || null,
          deliveryAddress: x.deliveryAddress || null,
          wpzId: x.wpzId ?? null,
          wpzOriginal: x.wpzId ? Boolean(x.wpzOriginal) : null,
          wpzComment: x.wpzComment || null,
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

            <TextField multiline minRows={3} label={t('order_comment')} value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} fullWidth />

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
                        setAddPosError('');
                        setAddPosQuery('');
                        setAddPosOptions([]);
                        setAddPosProduct(null);
                        setAddPosQty('');
                        setAddPosSalePrice('');
                        setAddPosDeliveryDate(tomorrow());
                        setAddPosDeliveryAddress('');
                        setAddPosDeliveryAddressManual(false);
                        setAddPosPackagingType('');
                        setAddPosIncotermId('');
                        setAddPosIncotermText('');
                        setAddPosSpecialPaymentCondition(false);
                        setAddPosSpecialPaymentId('');
                        setAddPosSpecialPaymentText('');
                        setAddPosWpzId(null);
                        setAddPosWpzOriginal(true);
                        setAddPosWpzComment('');
                      }}
                    >
                      <AddCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {positions.map((x, idx) => {
                    const deliveryDateValue = x.deliveryDate ? String(x.deliveryDate).slice(0, 10) : '';
                    return (
                      <Accordion key={`${x.id || x.beNumber || idx}-${idx}`} disableGutters>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'grid', width: '100%', gap: 0.35 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {x.article || '-'}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.75 }}>
                              {t('product_be_number')}: {x.beNumber || '-'} | {t('product_storage_id')}: {x.warehouseId || '-'}
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ display: 'grid', gap: 1.1 }}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                            <TextField
                              type="number"
                              label={t('product_amount')}
                              value={x.amountInKg ?? ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, amountInKg: e.target.value } : p)))}
                              inputProps={{ min: 1, step: 'any' }}
                              size="small"
                            />
                            <TextField
                              type="number"
                              label={t('order_sale_price')}
                              value={x.price ?? ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, price: e.target.value } : p)))}
                              inputProps={{ min: 0.01, step: 'any' }}
                              size="small"
                            />
                            <TextField
                              type="number"
                              label={t('product_price')}
                              value={x.costPrice ?? ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, costPrice: e.target.value } : p)))}
                              inputProps={{ min: 0.01, step: 'any' }}
                              size="small"
                            />
                            <TextField
                              type="date"
                              label={t('delivery_date')}
                              value={deliveryDateValue}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, deliveryDate: e.target.value } : p)))}
                              InputLabelProps={{ shrink: true }}
                              size="small"
                            />
                            <TextField
                              select
                              label={t('incoterm_label')}
                              value={x.incotermId ?? ''}
                              onChange={(e) => {
                                const selectedId = Number(e.target.value);
                                const selected = incotermOptions.find((z) => Number(z.id) === selectedId);
                                setPositions((prev) => prev.map((p, i) => (i === idx
                                  ? {
                                      ...p,
                                      incotermId: Number.isFinite(selectedId) ? selectedId : '',
                                      incotermText: selected?.text || '',
                                    }
                                  : p)));
                              }}
                              size="small"
                            >
                              {incotermOptions.map((z) => (
                                <MenuItem key={z.id} value={z.id}>{z.text}</MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              select
                              label={t('packaging_type_label')}
                              value={x.packagingType || ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, packagingType: e.target.value } : p)))}
                              size="small"
                            >
                              {packagingOptions.map((z) => (
                                <MenuItem key={z} value={z}>{z}</MenuItem>
                              ))}
                            </TextField>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {x.deliveryAddressManual ? (
                              <TextField
                                label={t('delivery_address_label')}
                                value={x.deliveryAddress || ''}
                                onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, deliveryAddress: e.target.value } : p)))}
                                size="small"
                                fullWidth
                              />
                            ) : (
                              <TextField
                                select
                                label={t('delivery_address_label')}
                                value={x.deliveryAddress || ''}
                                onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, deliveryAddress: e.target.value } : p)))}
                                size="small"
                                fullWidth
                                sx={{
                                  '& .MuiSelect-select': {
                                    minWidth: 0,
                                    overflow: 'hidden',
                                  },
                                }}
                                SelectProps={{
                                  renderValue: (selected) => {
                                    const hit = deliveryAddressOptions.find((addr) => String(addr.text || '') === String(selected || ''));
                                    return hit ? renderDeliveryAddressOption(hit) : String(selected || '');
                                  },
                                }}
                              >
                                <MenuItem value="">{'-'}</MenuItem>
                                {String(x.deliveryAddress || '').trim()
                                  && !deliveryAddressOptions.some((addr) => String(addr.text || '') === String(x.deliveryAddress || ''))
                                  && <MenuItem value={x.deliveryAddress}>{x.deliveryAddress}</MenuItem>}
                                {deliveryAddressOptions.map((addr) => (
                                  <MenuItem key={`${addr.id}-${addr.text}`} value={addr.text}>
                                    {renderDeliveryAddressOption(addr)}
                                  </MenuItem>
                                ))}
                              </TextField>
                            )}
                            <IconButton
                              size="small"
                              onClick={() => setPositions((prev) => prev.map((p, i) => (i === idx
                                ? {
                                    ...p,
                                    deliveryAddress: '',
                                    deliveryAddressManual: !p.deliveryAddressManual,
                                  }
                                : p)))}
                            >
                              {x.deliveryAddressManual ? <RemoveCircleOutlineIcon fontSize="small" /> : <AddCircleOutlineIcon fontSize="small" />}
                            </IconButton>
                          </Box>
                          <FormControlLabel
                            control={(
                              <Checkbox
                                checked={Boolean(x.specialPaymentCondition)}
                                onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx
                                  ? {
                                      ...p,
                                      specialPaymentCondition: e.target.checked,
                                      ...(e.target.checked ? {} : { specialPaymentText: '', specialPaymentId: '' }),
                                    }
                                  : p)))}
                              />
                            )}
                            label={t('special_payment_condition')}
                          />
                          {Boolean(x.specialPaymentCondition) && (
                            <TextField
                              select
                              label={t('special_payment_text_label')}
                              value={x.specialPaymentId ?? ''}
                              onChange={(e) => {
                                const selectedId = Number(e.target.value);
                                const selected = paymentTextOptions.find((z) => Number(z.id) === selectedId);
                                setPositions((prev) => prev.map((p, i) => (i === idx
                                  ? {
                                      ...p,
                                      specialPaymentId: Number.isFinite(selectedId) ? selectedId : '',
                                      specialPaymentText: selected?.text || '',
                                    }
                                  : p)));
                              }}
                              size="small"
                            >
                              {paymentTextOptions.map((z) => (
                                <MenuItem key={z.id} value={z.id}>{z.text}</MenuItem>
                              ))}
                            </TextField>
                          )}
                          {x.wpzId ? (
                            <>
                              <FormControlLabel
                                control={(
                                  <Checkbox
                                    checked={Boolean(x.wpzOriginal)}
                                    onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx
                                      ? { ...p, wpzOriginal: e.target.checked, ...(e.target.checked ? { wpzComment: '' } : {}) }
                                      : p)))}
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
                            value={x.wpzComment || ''}
                            onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, wpzComment: e.target.value } : p)))}
                            size="small"
                            multiline
                            minRows={2}
                            fullWidth
                          />
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <IconButton size="small" color="error" onClick={() => onRemovePosition(idx)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
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
          {addPosError && <Alert severity="error">{addPosError}</Alert>}
          <Autocomplete
            options={addPosOptionsWithSelection}
            value={addPosProduct}
            isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
            getOptionLabel={(opt) => String(opt?.article || '')}
            onChange={(e, value) => {
              setAddPosProduct(value);
              const acquisition = Number(value?.acquisitionPrice);
              if (Number.isFinite(acquisition) && acquisition > 0) {
                setAddPosSalePrice(String(acquisition));
              }
              setAddPosWpzId(null);
              setAddPosWpzOriginal(true);
              setAddPosWpzComment('');
              if (value?.id) {
                (async () => {
                  try {
                    const wpzRes = await apiRequest(`/products/${encodeURIComponent(value.id)}/wpz`);
                    const idNum = Number(wpzRes?.data?.wpzId);
                    setAddPosWpzId(Number.isFinite(idNum) && idNum > 0 ? idNum : null);
                  } catch {
                    setAddPosWpzId(null);
                  }
                })();
              }
            }}
            inputValue={addPosQuery}
            onInputChange={(e, value) => setAddPosQuery(value)}
            renderOption={(props, option) => (
              <Box
                component="li"
                {...props}
                sx={{
                  display: 'flex !important',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: 0.1,
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <Typography variant="body2" sx={{ width: '100%', textAlign: 'left' }}>
                  {String(option?.article || '')}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: '100%', textAlign: 'left' }}>
                  {`${String(option?.warehouse || '-')}; ${option?.amount ?? '-'} ${String(option?.unit || 'kg')}; ${Number.isFinite(Number(option?.acquisitionPrice))
                    ? Number(option.acquisitionPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '-'} EUR`}
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
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.5 }}>
            {addPosAvailableAmount === null
              ? `${t('product_available_now')}: -`
              : `${t('product_available_now')}: ${addPosAvailableAmount} ${String(addPosProduct?.unit || 'kg')}`}
          </Typography>
          <TextField
            type="number"
            label={t('order_sale_price')}
            value={addPosSalePrice}
            onChange={(e) => setAddPosSalePrice(e.target.value)}
            inputProps={{ min: 0.01, step: 'any' }}
            fullWidth
          />
          <TextField
            type="date"
            label={t('delivery_date')}
            value={addPosDeliveryDate}
            onChange={(e) => setAddPosDeliveryDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {addPosDeliveryAddressManual ? (
              <TextField
                label={t('delivery_address_label')}
                value={addPosDeliveryAddress}
                onChange={(e) => setAddPosDeliveryAddress(e.target.value)}
                fullWidth
              />
            ) : (
              <TextField
                select
                label={t('delivery_address_label')}
                value={addPosDeliveryAddress}
                onChange={(e) => setAddPosDeliveryAddress(e.target.value)}
                fullWidth
                sx={{
                  '& .MuiSelect-select': {
                    minWidth: 0,
                    overflow: 'hidden',
                  },
                }}
                SelectProps={{
                  renderValue: (selected) => {
                    const hit = deliveryAddressOptions.find((addr) => String(addr.text || '') === String(selected || ''));
                    return hit ? renderDeliveryAddressOption(hit) : String(selected || '');
                  },
                }}
              >
                <MenuItem value="">{'-'}</MenuItem>
                {deliveryAddressOptions.map((addr) => (
                  <MenuItem key={`${addr.id}-${addr.text}`} value={addr.text}>
                    {renderDeliveryAddressOption(addr)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <IconButton
              size="small"
              onClick={() => {
                setAddPosDeliveryAddress('');
                setAddPosDeliveryAddressManual((prev) => !prev);
              }}
            >
              {addPosDeliveryAddressManual ? <RemoveCircleOutlineIcon fontSize="small" /> : <AddCircleOutlineIcon fontSize="small" />}
            </IconButton>
          </Box>
          <TextField
            select
            label={t('incoterm_label')}
            value={addPosIncotermId}
            onChange={(e) => {
              const selectedId = Number(e.target.value);
              const selected = incotermOptions.find((x) => Number(x.id) === selectedId);
              setAddPosIncotermId(Number.isFinite(selectedId) ? selectedId : '');
              setAddPosIncotermText(selected?.text || '');
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
            value={addPosPackagingType}
            onChange={(e) => setAddPosPackagingType(e.target.value)}
            fullWidth
          >
            {packagingOptions.map((x) => (
              <MenuItem key={x} value={x}>{x}</MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={(
              <Checkbox
                checked={addPosSpecialPaymentCondition}
                onChange={(e) => {
                  setAddPosSpecialPaymentCondition(e.target.checked);
                  if (!e.target.checked) {
                    setAddPosSpecialPaymentId('');
                    setAddPosSpecialPaymentText('');
                  }
                }}
              />
            )}
            label={t('special_payment_condition')}
          />
          {addPosSpecialPaymentCondition && (
            <TextField
              select
              label={t('special_payment_text_label')}
              value={addPosSpecialPaymentId}
              onChange={(e) => {
                const selectedId = Number(e.target.value);
                const selected = paymentTextOptions.find((x) => Number(x.id) === selectedId);
                setAddPosSpecialPaymentId(Number.isFinite(selectedId) ? selectedId : '');
                setAddPosSpecialPaymentText(selected?.text || '');
              }}
              fullWidth
            >
              {paymentTextOptions.map((x) => (
                <MenuItem key={x.id} value={x.id}>{x.text}</MenuItem>
              ))}
            </TextField>
          )}
          {addPosProduct && (addPosWpzId ? (
            <>
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={addPosWpzOriginal}
                    onChange={(e) => {
                      setAddPosWpzOriginal(e.target.checked);
                      if (e.target.checked) setAddPosWpzComment('');
                    }}
                  />
                )}
                label={t('wpz_original_use')}
              />
            </>
          ) : (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('wpz_label')}: {t('wpz_not_available')}
            </Typography>
          ))}
          {addPosProduct && (
            <TextField
              label={t('wpz_comment_label')}
              value={addPosWpzComment}
              onChange={(e) => setAddPosWpzComment(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPosOpen(false)}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(addPosQty);
              const salePrice = Number(addPosSalePrice);
              const product = addPosProduct;
              if (!product) {
                setAddPosError(t('validation_product_required'));
                return;
              }
              if (!Number.isFinite(qty) || qty <= 0) {
                setAddPosError(t('validation_amount_positive'));
                return;
              }
              const price = Number(product.acquisitionPrice);
              if (!Number.isFinite(price) || price <= 0) {
                setAddPosError(t('validation_price_positive'));
                return;
              }
              if (!Number.isFinite(salePrice) || salePrice <= 0) {
                setAddPosError(t('validation_sale_price_positive'));
                return;
              }
              if (!addPosDeliveryDate) {
                setAddPosError(t('validation_delivery_date_required'));
                return;
              }
              if (!String(addPosDeliveryAddress || '').trim()) {
                setAddPosError(t('validation_delivery_address_required'));
                return;
              }
              if (!addPosIncotermId) {
                setAddPosError(t('validation_incoterm_required'));
                return;
              }
              if (!addPosPackagingType) {
                setAddPosError(t('validation_packaging_required'));
                return;
              }
              if (addPosSpecialPaymentCondition && !addPosSpecialPaymentId) {
                setAddPosError(t('validation_special_payment_text_required'));
                return;
              }
              if (addPosWpzId && !addPosWpzOriginal && !String(addPosWpzComment || '').trim()) {
                setAddPosError(t('validation_wpz_comment_required'));
                return;
              }
              setAddPosError('');
              setPositions((prev) => ([
                ...prev,
                {
                  id: `${String(product.beNumber || 'pos')}-${String(product.storageId || '')}-${Date.now()}`,
                  beNumber: String(product.beNumber || '').trim(),
                  warehouseId: String(product.storageId || '').trim(),
                  article: product.article,
                  amountInKg: qty,
                  price: salePrice,
                  costPrice: price,
                  reservationInKg: null,
                  reservationDate: null,
                  ...createPositionDefaults({
                    specialPaymentCondition: addPosSpecialPaymentCondition,
                    specialPaymentText: addPosSpecialPaymentText || '',
                    specialPaymentId: addPosSpecialPaymentId || '',
                    incotermText: addPosIncotermText || '',
                    incotermId: addPosIncotermId || '',
                    packagingType: addPosPackagingType || '',
                    deliveryDate: addPosDeliveryDate,
                    deliveryAddress: addPosDeliveryAddress,
                    deliveryAddressManual: addPosDeliveryAddressManual,
                    wpzId: addPosWpzId,
                    wpzOriginal: addPosWpzOriginal,
                    wpzComment: addPosWpzComment || '',
                  }),
                },
              ]));
              setAddPosError('');
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

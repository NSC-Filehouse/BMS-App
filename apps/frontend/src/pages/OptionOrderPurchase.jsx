import React from 'react';
import { Alert, Autocomplete, Box, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import PurchaseOrderEditor from '../components/PurchaseOrderEditor.jsx';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';
import { navigateToReturn } from '../utils/navigation.js';
import { confirmedTotalKg, defaultOptionPackagingId, truckOptionAvailability } from '../utils/optionQuantityConfirmation.js';
import { optionPackagingText } from '../utils/optionDisplay.js';
import { purchaseOrderRequestBody } from '../utils/purchaseOrderAttachments.js';

export default function OptionOrderPurchase() {
  const { id, positionId } = useParams();
  const { state } = useLocation();
  const input = state?.procurementOption;
  if (state?.mandant !== getMandant() || !state?.clientRequestId
    || String(input?.optionId) !== id || String(input?.optionPositionId) !== positionId) {
    return <Navigate to={`/options/${id}/positions/${positionId}`} replace />;
  }
  return <PurchaseForOrder key={state.clientRequestId} state={state} />;
}

function PurchaseForOrder({ state }) {
  const { procurementOption: option, clientRequestId, returnTo } = state;
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const base = `/options/${option.optionId}/positions/${option.optionPositionId}/purchase`;
  const attachmentInputRef = React.useRef(null);
  const pendingSave = React.useRef(null);
  const [availability, setAvailability] = React.useState(null);
  const [proposals, setProposals] = React.useState([]);
  const [supplier, setSupplier] = React.useState(option.optionSupplier);
  const [supplierQuery, setSupplierQuery] = React.useState('');
  const [supplierResults, setSupplierResults] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');
  const [searchError, setSearchError] = React.useState('');
  const [saveError, setSaveError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [order, setOrder] = React.useState(null);
  const [totalAmount, setTotalAmount] = React.useState('');
  const [totalUnit, setTotalUnit] = React.useState('kg');
  const [quantityConfirmed, setQuantityConfirmed] = React.useState(false);
  const back = () => navigateToReturn(navigate, returnTo, '/options');

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest(`${base}/suppliers?q=`, { signal: controller.signal }).then(({ data, meta }) => {
      if (controller.signal.aborted) return;
      setProposals(data || []);
      setSupplier((current) => current || data?.find((row) => row.preferred) || (data?.length === 1 ? data[0] : null));
      setAvailability(meta);
      setTotalAmount(meta.confirmedTruckCount ?? meta.confirmedQuantityKg ?? '');
      setTotalUnit(meta.truckOffer ? 'truck' : 'kg');
    }).catch((cause) => { if (!controller.signal.aborted) setLoadError(cause.message); });
    return () => controller.abort();
  }, [base]);

  const query = supplierQuery.trim();
  React.useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest(`${base}/suppliers?${new URLSearchParams({ q: query })}`, { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted) setSupplierResults((data || []).filter((row) => row.selectable)); })
        .catch((cause) => { if (!controller.signal.aborted) setSearchError(cause.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, query]);

  const defaultPackaging = availability?.packagingTypes?.find((row) => row.id === Number(defaultOptionPackagingId(availability)));
  const packaging = order
    ? availability?.packagingTypes?.find((row) => row.id === Number(order.packagingTypeId))
    : defaultPackaging;
  const automaticTruck = availability?.truckOffer && Number(availability.offeredTrucks) > 0;
  const needsQuantity = availability && !automaticTruck && (availability.remainingKg == null
    || (availability.truckOffer && availability.quantityConfirmationEditable
      && availability.confirmedPackagingTypeId != null && packaging?.id !== Number(availability.confirmedPackagingTypeId)));
  const remainingKg = (truckOptionAvailability(availability || {}, packaging) || availability)?.remainingKg;
  const initialRemainingKg = (truckOptionAvailability(availability || {}, defaultPackaging) || availability)?.remainingKg;
  const canEditSupplier = !option.optionSupplier;
  const supplierChoices = query.length < 2 ? proposals : supplierResults || [];
  const stockHint = remainingKg == null ? undefined : t('purchase_max_available', { amount: Number(remainingKg).toLocaleString(lang) });

  const submit = async (values) => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (!pendingSave.current) {
        const amount = Number(values.positions[0].amount);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(t('offer_order_whole_kg'));
        if (needsQuantity) {
          const totalKg = confirmedTotalKg(totalAmount, totalUnit, packaging);
          if (!quantityConfirmed || totalKg == null) throw new Error(t('procurement_option_confirm_quantity'));
          if (amount > totalKg - Number(availability.orderedKg || 0)) throw new Error(t('procurement_option_quantity_limit'));
          const { data } = await apiRequest(`${base}/quantity`, {
            method: 'POST',
            body: JSON.stringify({
              totalAmount, totalUnit, quantityConfirmed, packagingTypeId: values.packagingTypeId,
              quantitySourceHash: availability.quantitySourceHash, expectedConfirmedKg: availability.confirmedQuantityKg,
              expectedConfirmedPackagingTypeId: availability.confirmedPackagingTypeId,
            }),
          });
          setAvailability((current) => ({ ...current, ...data }));
        } else if (remainingKg != null && amount > remainingKg) {
          throw new Error(t('procurement_option_quantity_limit'));
        }
        pendingSave.current = { ...values, clientRequestId };
      }
      setLocked(true);
      const { data } = await apiRequest('/temp-purchase-orders', {
        method: 'POST', body: purchaseOrderRequestBody(pendingSave.current),
      });
      const [saved] = data?.positions || [];
      if (!data?.id || !data.clientRequestId || !saved?.id || data.positions.length !== 1
        || Number(saved.optionPositionId) !== Number(option.optionPositionId)
        || saved.articleIndex.trim().toLowerCase() !== option.articleIndex.trim().toLowerCase()) {
        throw new Error(t('procurement_option_saved_purchase_missing'));
      }
      navigate('/temp-orders/new', { replace: true, state: {
        returnTo: { pathname: `/temp-purchase-orders/${data.id}`, state: { returnTo, shoppingReturnTo: returnTo } },
        procurementOption: {
          optionId: saved.optionId, optionPositionId: saved.optionPositionId,
          savedPurchaseId: data.id, savedPurchasePositionId: saved.id, purchaseRequestId: data.clientRequestId,
          articleIndex: saved.articleIndex, article: option.article, amountInKg: saved.amount, price: '',
          costPrice: saved.purchasePrice, originalPackagingType: data.packagingType, originalPackagingTypeId: data.packagingTypeId,
        },
      } });
    } catch (cause) {
      if ([400, 413, 422].includes(cause.status)) { pendingSave.current = null; setLocked(false); }
      setSaveError(cause.message || t('loading_error'));
      return cause;
    } finally {
      setSaving(false);
    }
  };

  return <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, display: 'grid', gap: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <DisclosureBackButton onClick={back} disabled={saving || locked} aria-label={t('back_label')}><ArrowBackIcon /></DisclosureBackButton>
      <Typography variant="h5" sx={{ flex: 1 }}>{t('purchase_option_title')}</Typography>
      <IconButton disabled={!supplier || !availability || saving || locked} onClick={() => attachmentInputRef.current?.click()}
        aria-label={t('temp_order_attachment_add')}><AttachFileIcon /></IconButton>
    </Box>
    <Alert severity="info">{t('procurement_option_purchase_first')}</Alert>
    {loadError && <Alert severity="error">{loadError}</Alert>}
    {searchError && <Alert severity="error">{searchError}</Alert>}
    {saveError && <Alert severity="error">{saveError}</Alert>}
    {!availability && !loadError && <CircularProgress size={24} />}
    {canEditSupplier && availability && <Autocomplete
      options={supplier && !supplierChoices.some((row) => row.id === supplier.id) ? [supplier, ...supplierChoices] : supplierChoices}
      value={supplier} disabled={saving || locked} openOnFocus filterOptions={(rows) => rows}
      loading={query.length >= 2 && !supplierResults && !searchError} noOptionsText={t('suppliers_search_empty')}
      getOptionKey={(row) => row.id} getOptionLabel={(row) => [row.name, row.city, row.id].filter(Boolean).join(' · ')}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_event, value, reason) => {
        if (reason !== 'input' && reason !== 'clear') return;
        if (value.trim() !== query) { setSupplierResults(null); setSearchError(''); }
        setSupplierQuery(value);
      }}
      onChange={(_event, selected) => {
        setSupplier(selected); setSupplierQuery(''); setSupplierResults(null); setOrder(null);
      }}
      renderInput={(params) => <TextField {...params} required size="small" label={t('supplier_label')} placeholder={t('purchase_supplier_query')} />}
    />}
    {supplier && availability && <PurchaseOrderEditor key={supplier.id} isNew fixedPosition
      attachmentInputRef={attachmentInputRef} onContinue={back} onSave={submit} onChange={setOrder} saving={saving} locked={locked}
      stockHint={stockHint}
      initialOrder={{
        supplierId: supplier.id, supplierName: supplier.name,
        packagingTypeId: defaultPackaging?.id, packagingType: defaultPackaging?.text,
        deliveryTermText: state.incoterm,
        loadingLocationText: state.loadingLocation || '', loadingLocationSource: state.loadingLocation ? 'manual' : '',
        positions: [{
          lineId: clientRequestId, optionId: option.optionId, optionPositionId: option.optionPositionId,
          articleIndex: option.articleIndex, article: state.supplierArticleName || option.article, masterArticleName: option.article,
          supplierConfirmed: true, articleConfirmed: true, unit: 'kg',
          amount: initialRemainingKg > 0 ? Math.floor(initialRemainingKg) : '', amountTouched: true,
          purchasePrice: option.costPrice ?? '', requestedDeliveryDate: '',
          originalPackagingType: optionPackagingText({
            packagingDisplay: availability.sourcePackagingDisplay, packagingText: availability.sourcePackaging,
          }, lang),
        }],
      }}
      optionQuantityFields={needsQuantity && <Box sx={{ display: 'grid', gap: 1 }}>
        <Alert severity="info">{t(availability.truckOffer ? 'purchase_missing_trucks' : 'purchase_missing_quantity')}</Alert>
        <TextField required size="small" type="number" value={totalAmount} disabled={saving || locked}
          label={t(availability.truckOffer ? 'purchase_offered_trucks' : 'purchase_offered_quantity')}
          onChange={(event) => { setTotalAmount(event.target.value); setQuantityConfirmed(false); }} />
        {!availability.truckOffer && <TextField select size="small" label={t('product_unit')} value={totalUnit}
          disabled={saving || locked} onChange={(event) => { setTotalUnit(event.target.value); setQuantityConfirmed(false); }}>
          <MenuItem value="kg">kg</MenuItem><MenuItem value="t">{t('purchase_tonnes')}</MenuItem>
        </TextField>}
        <FormControlLabel label={t('procurement_option_confirm_quantity')}
          control={<Checkbox checked={quantityConfirmed} disabled={saving || locked} onChange={(event) => setQuantityConfirmed(event.target.checked)} />} />
      </Box>}
    />}
  </Box>;
}

import React from 'react';
import { Alert, Autocomplete, Box, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { PurchaseOptionArticleNames } from '../components/PurchaseOrderSummary.jsx';
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

export function PurchaseForOrder({ state, offerPosition, directPosition, stockLots = [], onPurchaseSaved, onBack }) {
  const { procurementOption: option, clientRequestId, returnTo } = state;
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const base = option.optionPositionId ? `/options/${option.optionId}/positions/${option.optionPositionId}/purchase` : null;
  const attachmentInputRef = React.useRef(null);
  const pendingSave = React.useRef(null);
  const pendingStock = React.useRef(null);
  const [savedPurchase, setSavedPurchase] = React.useState(null);
  const [availability, setAvailability] = React.useState(base ? null : {});
  const [proposals, setProposals] = React.useState([]);
  const [supplier, setSupplier] = React.useState(option.optionSupplier);
  const [supplierResolvedFromOption, setSupplierResolvedFromOption] = React.useState(false);
  const [supplierQuery, setSupplierQuery] = React.useState('');
  const [supplierResults, setSupplierResults] = React.useState(null);
  const [loadError, setLoadError] = React.useState('');
  const [searchError, setSearchError] = React.useState('');
  const [saveError, setSaveError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [order, setOrder] = React.useState(null);
  const [stockKey, setStockKey] = React.useState(directPosition?.procurement?.stock?.key || '');
  const [totalAmount, setTotalAmount] = React.useState('');
  const [totalUnit, setTotalUnit] = React.useState('kg');
  const [quantityConfirmed, setQuantityConfirmed] = React.useState(false);
  const back = onBack || (() => navigateToReturn(navigate, returnTo, '/options'));

  React.useEffect(() => {
    if (!base) return;
    const controller = new AbortController();
    apiRequest(`${base}/suppliers?q=`, { signal: controller.signal }).then(({ data, meta }) => {
      if (controller.signal.aborted) return;
      setProposals(data || []);
      const resolved = data?.find((row) => row.preferred) || (data?.length === 1 ? data[0] : null);
      setSupplierResolvedFromOption(Boolean(resolved && resolved.selectable !== false));
      setSupplier((current) => current || resolved);
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
      const path = base ? `${base}/suppliers?${new URLSearchParams({ q: query })}`
        : '/customers?' + new URLSearchParams({ q: query, supplierOnly: '1', includeInactive: '1', pageSize: '15' });
      apiRequest(path, { signal: controller.signal })
        .then(({ data = [] }) => {
          if (controller.signal.aborted) return;
          setSupplierResults(base ? data.filter((row) => row.selectable) : data.map((row) => ({
            id: String(row.kd_KdNR).trim(), name: row.kd_Name1 || row.kd_Name2, city: row.kd_Ort,
          })));
        })
        .catch((cause) => { if (!controller.signal.aborted) setSearchError(cause.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, query]);

  const defaultPackaging = availability?.packagingTypes?.find((row) => row.id === Number(defaultOptionPackagingId(availability)));
  const packaging = order
    ? availability?.packagingTypes?.find((row) => row.id === Number(order.packagingTypeId))
    : defaultPackaging;
  const automaticTruck = availability?.truckOffer && Number(availability.offeredTrucks) > 0;
  const needsQuantity = base && availability && !automaticTruck && (availability.remainingKg == null
    || (availability.truckOffer && availability.quantityConfirmationEditable
      && availability.confirmedPackagingTypeId != null && packaging?.id !== Number(availability.confirmedPackagingTypeId)));
  const remainingKg = (truckOptionAvailability(availability || {}, packaging) || availability)?.remainingKg;
  const initialRemainingKg = (truckOptionAvailability(availability || {}, defaultPackaging) || availability)?.remainingKg;
  const canEditSupplier = !option.optionSupplier && !(offerPosition && supplierResolvedFromOption);
  const supplierChoices = query.length < 2 ? proposals : supplierResults || [];
  const directAmount = Number(directPosition?.amountInKg);
  const requestedAmount = Number(order?.positions[0]?.amount ?? directPosition?.procurement?.position?.amount ?? directAmount);
  const remainder = directAmount - requestedAmount;
  const usableLots = remainder > 0 ? stockLots.filter(lot => lot.available >= remainder) : [];
  const selectedLot = usableLots.find(lot => lot.key === stockKey) || (usableLots.length === 1 ? usableLots[0] : null);
  const stockHint = remainingKg == null ? undefined : t('purchase_max_available', { amount: Number(remainingKg).toLocaleString(lang) });

  const submit = async (values, sendToBms = false) => {
    if (saving) return;
    let purchase = savedPurchase;
    setSaving(true);
    setSaveError('');
    try {
      if (!pendingSave.current) {
        const amount = Number(values.positions[0].amount);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(t('offer_order_whole_kg'));
        if (offerPosition && amount !== offerPosition.amountInKg) throw new Error(t('procurement_quantity_invalid'));
        if (directPosition && (amount > directAmount || (amount < directAmount && !selectedLot))) {
          throw new Error(t('procurement_quantity_invalid'));
        }
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
        pendingSave.current = { ...values, clientRequestId, reserveOrderPosition: true };
        pendingStock.current = selectedLot;
      }
      setLocked(true);
      const data = purchase || (await apiRequest('/temp-purchase-orders', {
        method: 'POST', body: purchaseOrderRequestBody(pendingSave.current),
      })).data;
      const [saved] = data?.positions || [];
      if (!data?.id || !data.clientRequestId || !saved?.id || !saved.orderPositionId || data.positions.length !== 1
        || Number(saved.optionPositionId || 0) !== Number(option.optionPositionId || 0)
        || saved.articleIndex.trim().toLowerCase() !== option.articleIndex.trim().toLowerCase()) {
        throw new Error(t('procurement_option_saved_purchase_missing'));
      }
      purchase = data;
      setSavedPurchase(data);
      if (sendToBms) {
        const result = await apiRequest(`/temp-purchase-orders/${encodeURIComponent(data.id)}/finalize`, { method: 'POST' });
        const mail = result.data?.csMail;
        if (Number(result.data?.status) !== 2
          && (Number(result.data?.status) !== 1 || (!mail?.queued && !mail?.alreadyQueued))) {
          throw new Error(t('purchase_bms_mail_pending'));
        }
      }
      const purchasedLine = {
          optionId: saved.optionId, optionPositionId: saved.optionPositionId,
          savedPurchaseId: data.id, savedPurchasePositionId: saved.id, purchaseRequestId: data.clientRequestId,
          articleIndex: saved.articleIndex, article: option.article, amountInKg: saved.amount, price: '',
          costPrice: data.currency === 'USD' ? null : saved.purchasePrice, purchaseCurrency: data.currency,
          originalPackagingType: data.packagingType, originalPackagingTypeId: data.packagingTypeId,
          ...(directPosition && { savedPurchaseAmount: saved.amount, savedPurchaseStock: pendingStock.current }),
      };
      if (onPurchaseSaved) {
        onPurchaseSaved(purchasedLine);
        return;
      }
      navigate('/temp-orders/new', { replace: true, state: {
        returnTo: { pathname: `/temp-purchase-orders/${data.id}`, state: { returnTo, shoppingReturnTo: returnTo } },
        procurementOption: purchasedLine,
      } });
    } catch (cause) {
      if (!purchase && [400, 413, 422].includes(cause.status)) { pendingSave.current = null; setLocked(false); }
      const message = cause.message || t('loading_error');
      setSaveError(purchase ? t('purchase_bms_saved_error', { id: purchase.id, message }) : message);
      return cause;
    } finally {
      setSaving(false);
    }
  };

  const loadingLocation = availability?.sourceLoadingLocation || state.loadingLocation || '';
  const supplierSelection = canEditSupplier && availability ? <Autocomplete
      options={supplier && !supplierChoices.some((row) => row.id === supplier.id) ? [supplier, ...supplierChoices] : supplierChoices}
      value={supplier} disabled={saving || locked} openOnFocus filterOptions={(rows) => rows}
      loading={query.length >= 2 && !supplierResults && !searchError} noOptionsText={t('suppliers_search_empty')}
      getOptionKey={(row) => row.id} getOptionLabel={(row) => [row.name, row.city].filter(Boolean).join(' · ')}
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
    /> : null;

  return <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, display: 'grid', gap: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <DisclosureBackButton onClick={back} disabled={saving || locked} aria-label={t('back_label')}><ArrowBackIcon /></DisclosureBackButton>
      <Typography variant="h5" sx={{ flex: 1 }}>{t(base ? 'purchase_option_title' : offerPosition
        ? 'procurement_offer_purchase_title' : 'procurement_purchase_title')}</Typography>
      <IconButton disabled={!supplier || !availability || saving || locked} onClick={() => attachmentInputRef.current?.click()}
        aria-label={t('temp_order_attachment_add')}><AttachFileIcon /></IconButton>
    </Box>
    {base && <PurchaseOptionArticleNames positions={[{ optionId: option.optionId,
      article: state.supplierArticleName || availability?.sourceArticleName || option.article, masterArticleName: option.article }]} />}
    <Alert severity="info">{t((offerPosition?.candidates?.length || stockLots.length)
      ? 'procurement_offer_insufficient_stock' : 'procurement_option_purchase_first')}</Alert>
    {loadError && <Alert severity="error">{loadError}</Alert>}
    {searchError && <Alert severity="error">{searchError}</Alert>}
    {saveError && <Alert severity="error">{saveError}</Alert>}
    {!availability && !loadError && <CircularProgress size={24} />}
    {!supplier && supplierSelection && <Card sx={{ minWidth: 0 }}>
      <CardContent sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <Typography variant="h6">{t('purchase_supplier_ambiguous')}</Typography>
        {supplierSelection}
      </CardContent>
    </Card>}
    {usableLots.length > 1 && <TextField select size="small" label={t('offer_order_select_stock')}
      value={selectedLot?.key || ''} disabled={saving || locked} onChange={event => setStockKey(event.target.value)}>
      {usableLots.map(lot => <MenuItem key={lot.key} value={lot.key}>
        {lot.beNumber} · {lot.warehouse || lot.warehouseId} · {Number(lot.available).toLocaleString(lang)} kg
      </MenuItem>)}
    </TextField>}
    {supplier && availability && <PurchaseOrderEditor key={supplier.id} isNew fixedPosition fixedQuantity={Boolean(offerPosition)} allowFirstPurchase={!base}
      supplierSelection={supplierSelection}
      attachmentInputRef={attachmentInputRef} onContinue={back} onSave={submit} onChange={setOrder} saving={saving} locked={locked}
      onSend={(values) => submit(values, true)} savedForHandoff={Boolean(savedPurchase)}
      stockHint={stockHint}
      initialOrder={{
        packagingTypeId: defaultPackaging?.id, packagingType: defaultPackaging?.text,
        deliveryTermText: availability.deliveryTermText || availability.sourceIncoterm || state.incoterm,
        optionLoadingLocationText: loadingLocation,
        loadingLocationText: loadingLocation,
        loadingLocationSource: loadingLocation ? 'manual' : '',
        ...directPosition?.procurement?.header,
        supplierId: supplier.id, supplierName: supplier.name,
        positions: [{
          lineId: clientRequestId, optionId: option.optionId, optionPositionId: option.optionPositionId,
          articleIndex: option.articleIndex, article: state.supplierArticleName || availability.sourceArticleName || option.article, masterArticleName: option.article,
          supplierConfirmed: true, articleConfirmed: true, unit: 'kg',
          amount: offerPosition?.amountInKg ?? directPosition?.amountInKg ?? (initialRemainingKg > 0 ? Math.floor(initialRemainingKg) : ''), amountTouched: true,
          purchasePrice: directPosition && !base ? '' : option.costPrice ?? '', requestedDeliveryDate: directPosition?.deliveryDate || '',
          originalPackagingType: optionPackagingText({
            packagingDisplay: availability.sourcePackagingDisplay, packagingText: availability.sourcePackaging,
          }, lang),
          ...directPosition?.procurement?.position,
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

import React from 'react';
import { Alert, Autocomplete, Box, Button, Card, CardContent, CircularProgress, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UndoIcon from '@mui/icons-material/Undo';
import PurchaseOrderSummary from './PurchaseOrderSummary.jsx';
import PurchaseOrderActions from './PurchaseOrderActions.jsx';
import CompactAddressOption from './CompactAddressOption.jsx';
import LoadingLocationDialog from './LoadingLocationDialog.jsx';
import {loadingLocationParts} from '../utils/loadingLocationDisplay.js';
import { apiRequest } from '../api/client.js';
import { findIncotermByCode } from '../utils/incoterm.js';
import { packagingKey, purchaseMissingFields, purchaseFieldErrors, createPurchaseLineId } from '../utils/purchaseCart.js';
import { useI18n } from '../utils/i18n.jsx';

const formatDate = (value, lang) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '–';
const priceText = (value, locale) => value === null || value === undefined ? '–' : `${Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/t`;
const same = (a, b) => String(a || '').trim().toLocaleLowerCase('de-DE') === String(b || '').trim().toLocaleLowerCase('de-DE');

export default function PurchaseOrderEditor({ initialOrder, attachmentInputRef, isNew = false, onChange, onSave, onContinue, onDelete, saving, locked = false, linkedSetup = false, linkedOrder = false, allowFirstPurchase = false, stockHint, fixedPosition = false, fixedQuantity = false, optionQuantityFields }) {
  const { lang, t } = useI18n();
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const [order, setOrder] = React.useState(() => initialOrder.paymentConditionText
    ? initialOrder : { ...initialOrder, paymentConditionId: null });
  const [options, setOptions] = React.useState({ packagingTypes: [], incoterms: [] });
  const [locations, setLocations] = React.useState([]);
  const [history, setHistory] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [locationsLoading, setLocationsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [locationError, setLocationError] = React.useState('');
  const [paymentTexts, setPaymentTexts] = React.useState([]);
  const [paymentTextsLoading, setPaymentTextsLoading] = React.useState(false);
  const [paymentTextsError, setPaymentTextsError] = React.useState('');
  const selectPayment = !order.paymentConditionText || order.paymentConditionChanged === true;
  const [attempted, setAttempted] = React.useState(false);
  const [rejectedDeliveryDate, setRejectedDeliveryDate] = React.useState(null);
  const editorRef = React.useRef(null);
  const locationSignature = JSON.stringify([...new Set(order.positions.map((p) => p.articleIndex).filter(Boolean))].sort());
  const manualLocation=order.loadingLocationSource==='manual';
  const [newLocationOpen,setNewLocationOpen]=React.useState(false);
  const [newLocations,setNewLocations]=React.useState([]);
  const [showLocationDetails,setShowLocationDetails]=React.useState(false);
  const update = React.useCallback((fn) => setOrder((previous) => typeof fn === 'function' ? fn(previous) : { ...previous, ...fn }), []);
  React.useEffect(() => { onChange?.(order); }, [order, onChange]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    apiRequest(`/purchase-order-options?supplierId=${encodeURIComponent(initialOrder.supplierId)}`).then((response) => {
      if (!alive) return;
      const data = response.data;
      setOptions(data);
      if (locked) return;
      update((previous) => {
        const original = [...new Set(previous.positions.map((p) => packagingKey(p.originalPackagingType)))];
        const packageValue = previous.packagingType || (original.length === 1 ? original[0] : '');
        const packaging = data.packagingTypes.find((p) => Number(previous.packagingTypeId) === p.id)
          || data.packagingTypes.find((p) => packageValue && p.aliases.some((alias) => packagingKey(alias) === packagingKey(packageValue)));
        const isOptionPurchase = previous.positions.some((position) => position.optionId != null);
        const deliveryTermText = previous.deliveryTermText || (isOptionPurchase ? '' : data.defaults.deliveryTermText);
        const incoterm = data.incoterms.find((p) => Number(previous.deliveryTermId) === p.id)
          || data.incoterms.find((p) => same(p.text, deliveryTermText))
          || (isOptionPurchase ? findIncotermByCode(data.incoterms, deliveryTermText) : null);
        const useDefaultPayment = isNew && !previous.paymentConditionChanged;
        return { ...previous, supplierContact: previous.supplierContact ?? data.defaults.supplierContact,
          paymentConditionId: useDefaultPayment
            ? (data.defaults.paymentConditionText ? data.defaults.paymentConditionId : null) : previous.paymentConditionId,
          paymentConditionText: useDefaultPayment ? data.defaults.paymentConditionText : previous.paymentConditionText,
          packagingTypeId: packaging?.id || '', packagingType: packaging?.text || '',
          deliveryTermId: incoterm?.id || '', deliveryTermText: incoterm?.text || '',
        };
      });
    }).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [initialOrder.supplierId, isNew, lang, locked, update]);

  React.useEffect(() => {
    if (loading || locked || !selectPayment) return;
    const controller = new AbortController();
    setPaymentTextsLoading(true);
    setPaymentTextsError('');
    apiRequest('/temp-orders/payment-texts', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setPaymentTexts(data || []); })
      .catch((cause) => { if (!controller.signal.aborted) setPaymentTextsError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setPaymentTextsLoading(false); });
    return () => controller.abort();
  }, [lang, loading, locked, selectPayment]);

  React.useEffect(() => {
    let alive = true;
    const ids = JSON.parse(locationSignature);
    setLocationsLoading(true); setLocationError('');
    const query = new URLSearchParams({ supplierId: order.supplierId });
    ids.forEach((id) => query.append('articleIndex', id));
    apiRequest(`/purchase-order-loading-locations?${query}`).then((response) => {
      if (!alive) return;
      const next = response.data || [];
      setLocations(next);
      if (locked) return;
      update((previous) => {
        if(previous.loadingLocationSource==='manual')return previous;
        const selected = next.find((p) => same(p.text, previous.loadingLocationText)) || (isNew ? next[0] : null);
        return { ...previous, loadingLocationId: '', loadingLocationText: selected?.text || '',loadingLocationSource:'supplier_order_history' };
      });
    }).catch((e) => alive && setLocationError(e.message)).finally(() => alive && setLocationsLoading(false));
    const initialHistory = {};
    // The same latest-purchase record supplies both historical hints.
    Promise.all(ids.map(async (id) => {
      if(order.positions.some(p=>p.articleIndex===id && p.optionId!=null))return;
      try {
        const response = await apiRequest(`/customers/${encodeURIComponent(order.supplierId)}/procured-articles/${encodeURIComponent(id)}/purchase-defaults`);
        initialHistory[id] = response.data.defaults;
      } catch (error) {
        if (error.code !== 'PURCHASE_ARTICLE_NOT_FOUND' || (!linkedSetup && !allowFirstPurchase && !order.positions.some((p) => p.articleIndex === id && p.firstPurchase))) throw error;
      }
    })).then(() => {
      if (!alive) return;
      setHistory(initialHistory);
      if (isNew && !locked) update((previous) => ({ ...previous, positions: previous.positions.map((p) => ({
        ...p, article: p.optionId!=null?p.article:initialHistory[p.articleIndex]?.article || p.article,
        masterArticleName: initialHistory[p.articleIndex]?.masterArticleName || p.masterArticleName,
      })) }));
    }).catch((e) => alive && setLocationError(e.message));
    return () => { alive = false; };
  }, [isNew, locationSignature, order.supplierId, locked, linkedSetup, allowFirstPurchase, update]);

  const patchPosition = (lineId, patch) => update((previous) => ({ ...previous, positions: previous.positions.map((p) => p.lineId === lineId ? { ...p, ...patch } : p) }));
  const missing = purchaseMissingFields(order);
  const fieldErrors = purchaseFieldErrors(order);
  const disabled = saving || locked;
  const savedAttachments = order.attachments || [];
  const pendingAttachmentFiles = order.pendingAttachmentFiles || [];
  const removeAttachmentIds = order.removeAttachmentIds || [];
  const restoredFilesMissing = order.hadPendingAttachments && !pendingAttachmentFiles.length;
  const handleAttachmentPick = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) update((previous) => ({ ...previous, hadPendingAttachments: false, pendingAttachmentFiles: [...(previous.pendingAttachmentFiles || []), ...files] }));
    event.target.value = '';
  };
  const locationOptions=[...locations,...newLocations.filter(item=>!locations.some(existing=>same(existing.text,item.text)))];
  if(manualLocation && order.loadingLocationText && !locationOptions.some(item=>same(item.text,order.loadingLocationText)))
    locationOptions.push({id:`manual:${order.loadingLocationText}`,text:order.loadingLocationText,source:'manual'});
  const contacts=[...new Set((options.defaults?.contacts || []).map(contact=>contact.name).filter(Boolean))];
  const removePosition = (lineId) => {
    if (disabled) return;
    if (order.positions.length === 1 && onDelete) { void onDelete(); return; }
    update((previous) => ({ ...previous, positions: previous.positions.filter((p) => p.lineId !== lineId) }));
  };
  const submit = async () => {
    setAttempted(true);
    if (!locked && missing.length) {
      requestAnimationFrame(() => editorRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setRejectedDeliveryDate(null);
    const saveFailure = await onSave(order);
    const date = saveFailure?.payload?.error?.details?.date;
    if (saveFailure?.code === 'PURCHASE_DELIVERY_DATE_NON_WORKING' && date) {
      setRejectedDeliveryDate({ date, loadingLocationText: order.loadingLocationText });
    }
  };
  const copy = (lineId) => update((previous) => {
    const positions = [...previous.positions];
    const index = positions.findIndex((p) => p.lineId === lineId);
    const source = positions[index];
    const { id, ...values } = source;
    positions.splice(index + 1, 0, { ...values, copyOfPositionId: id || source.copyOfPositionId, lineId: createPurchaseLineId(), amountTouched: true });
    return { ...previous, positions };
  });

  return <Box ref={editorRef} sx={{ display: 'grid', gap: 1.5, minWidth: 0, width: '100%', '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
    <input ref={attachmentInputRef} type="file" accept=".pdf,image/*,.heic,.heif" multiple hidden onChange={handleAttachmentPick} disabled={disabled} />
    {restoredFilesMissing && <Alert severity="info">{t('temp_order_draft_attachment_hint')}</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    {locationError && <Alert severity="error">{locationError}</Alert>}
    {!locationsLoading && !locationError && !locations.length && order.positions.length > 0 && !manualLocation && <Alert severity="info">{t('purchase_no_loading_history')}</Alert>}
    <Card sx={{ minWidth: 0 }}><CardContent sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
      {!linkedSetup && <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0, mt: -0.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{t('temp_order_attachment_label')}</Typography>
        {savedAttachments.length || pendingAttachmentFiles.length ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, flex: 1 }}>
            {savedAttachments.map((attachment) => {
              const attachmentId = Number(attachment.id);
              const removed = removeAttachmentIds.includes(attachmentId);
              return <Box key={`saved-${attachment.id}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Typography variant="body2" title={attachment.fileName} sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: removed ? 'text.disabled' : 'text.primary', textDecoration: removed ? 'line-through' : 'none' }}>
                  {attachment.fileName}{removed ? ` (${t('temp_order_attachment_removed')})` : ''}
                </Typography>
                {!attachment.isOptionPdf && <IconButton size="small" disabled={disabled} color={removed ? 'primary' : 'error'} aria-label={removed ? t('undo_label') : t('delete_label')} onClick={() => update((previous) => ({ ...previous,
                  removeAttachmentIds: removed ? (previous.removeAttachmentIds || []).filter((value) => value !== attachmentId) : [...(previous.removeAttachmentIds || []), attachmentId],
                }))}>{removed ? <UndoIcon fontSize="small" /> : <DeleteOutlineIcon fontSize="small" />}</IconButton>}
              </Box>;
            })}
            {pendingAttachmentFiles.map((file, index) => <Box key={`pending-${index}-${file.name}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
              <Typography variant="body2" title={file.name} sx={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</Typography>
              <IconButton size="small" color="error" disabled={disabled} aria-label={t('delete_label')} onClick={() => update((previous) => ({ ...previous, pendingAttachmentFiles: previous.pendingAttachmentFiles.filter((_, fileIndex) => fileIndex !== index) }))}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Box>)}
          </Box>
        ) : <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 0 }}>{t('temp_order_attachment_none')}</Typography>}
      </Box>}
      <Typography variant="h6" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{order.supplierName || order.supplierId}</Typography>
      <Autocomplete freeSolo forcePopupIcon options={contacts} value={order.supplierContact || null} inputValue={order.supplierContact || ''}
        disabled={disabled || loading} noOptionsText={t('purchase_no_contact')}
        onChange={(_event,value)=>update({supplierContact:value || ''})}
        onInputChange={(_event,value,reason)=>{if(reason==='input'||reason==='clear')update({supplierContact:value});}}
        renderInput={params=><TextField {...params} label={t('contact_label')} size="small" />} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1, minWidth: 0 }}>
        {selectPayment ? <TextField label={t('payment_terms_label')} select size="small" value={order.paymentConditionId || ''}
          disabled={disabled || loading || paymentTextsLoading || Boolean(paymentTextsError)}
          error={Boolean(paymentTextsError)} helperText={paymentTextsError} onChange={(event) => {
            const selected = paymentTexts.find((entry) => entry.id === Number(event.target.value));
            if (selected) update({ paymentConditionId: selected.id, paymentConditionText: selected.text, paymentConditionChanged: true });
          }}>
          <MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>
          {order.paymentConditionId && !paymentTexts.some((entry) => entry.id === Number(order.paymentConditionId)) &&
            <MenuItem value={order.paymentConditionId} disabled>{order.paymentConditionText}</MenuItem>}
          {paymentTexts.map((entry) => <MenuItem key={entry.id} value={entry.id}>{entry.text}</MenuItem>)}
        </TextField> : <TextField label={t('payment_terms_label')} size="small" value={order.paymentConditionText} InputProps={{ readOnly: true }} />}
        <TextField label="Incoterm" required select size="small" error={attempted && fieldErrors.deliveryTermId} value={order.deliveryTermId || ''} disabled={disabled || loading} onChange={(e) => {
          const option = options.incoterms.find((p) => p.id === Number(e.target.value));
          update({ deliveryTermId: option?.id || '', deliveryTermText: option?.text || '' });
        }}><MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>
          {order.deliveryTermId && !options.incoterms.some(p=>String(p.id)===String(order.deliveryTermId)) &&
            <MenuItem value={order.deliveryTermId} disabled>{order.deliveryTermText || t('purchase_saved_incoterm')}</MenuItem>}
          {options.incoterms.map((p) => <MenuItem key={p.id} value={p.id}>{p.text}</MenuItem>)}</TextField>
        <Box sx={{display:'grid',gap:0.5,minWidth:0}}><Box sx={{display:'flex',gap:1,alignItems:'center',minWidth:0}}><TextField label={t('purchase_loading_location')} required select size="small" error={attempted && fieldErrors.loadingLocationText} value={order.loadingLocationText || ''} disabled={disabled || locationsLoading}
          sx={{flex:1,minWidth:0,'& .MuiSelect-select':{minWidth:0,overflow:'hidden'}}}
          SelectProps={{renderValue:value=><CompactAddressOption {...loadingLocationParts(value)} />,classes:{select:'address-select'},MenuProps:{MenuListProps:{className:'address-select-list'},PaperProps:{sx:{maxHeight:320}}}}}
          onChange={(e) => {
          setShowLocationDetails(false);
          const selected=locationOptions.find(item=>same(item.text,e.target.value));
          update({ loadingLocationId: '', loadingLocationText: e.target.value,loadingLocationSource:selected?.source==='manual'?'manual':'supplier_order_history' });
        }}>
          <MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>
          {order.loadingLocationText && !locationOptions.some(p=>p.text===order.loadingLocationText) &&
            <MenuItem value={order.loadingLocationText} disabled><CompactAddressOption {...loadingLocationParts(order.loadingLocationText)} /></MenuItem>}
          {locationOptions.map((p) => <MenuItem key={p.id} value={p.text} divider sx={{py:1,minWidth:0}}><CompactAddressOption {...loadingLocationParts(p.text)} /></MenuItem>)}
        </TextField><IconButton size="small" color="primary" aria-label={t('purchase_add_loading_location')} title={t('purchase_add_loading_location')} disabled={disabled || loading || locationsLoading} onClick={()=>setNewLocationOpen(true)}><AddCircleOutlineIcon fontSize="small" /></IconButton></Box>
        {order.loadingLocationText && <Button size="small" sx={{justifySelf:'start',textTransform:'none'}} onClick={()=>setShowLocationDetails(value=>!value)} aria-expanded={showLocationDetails}>{showLocationDetails?t('purchase_hide_address'):t('purchase_show_address')}</Button>}
        {showLocationDetails && <Typography variant="caption" sx={{whiteSpace:'pre-line',overflowWrap:'anywhere'}}>{order.loadingLocationText}</Typography>}
        </Box>
        <TextField label={t('packaging_type_label')} required select size="small" error={attempted && fieldErrors.packagingTypeId} value={order.packagingTypeId || ''} disabled={disabled || loading} onChange={(e) => {
          const option = options.packagingTypes.find((p) => p.id === Number(e.target.value));
          update((previous) => ({ ...previous, packagingTypeId: option?.id || '', packagingType: option?.text || '',
            positions: previous.positions.map((p) => isNew && !p.amountTouched && p.optionId==null ? { ...p, amount: option?.key === 'silo' ? 25000 : 24750 } : p) }));
        }}><MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>
          {order.packagingTypeId && !options.packagingTypes.some(p=>String(p.id)===String(order.packagingTypeId)) &&
            <MenuItem value={order.packagingTypeId} disabled>{order.packagingType || t('purchase_saved_packaging')}</MenuItem>}
          {options.packagingTypes.map((p) => <MenuItem key={p.id} value={p.id}>{p.text}</MenuItem>)}</TextField>
      </Box>
      <TextField label={t('wpz_option_other')} multiline minRows={2} size="small" value={order.comment || ''} onChange={(e) => update({ comment: e.target.value })} disabled={disabled} />
    </CardContent></Card>
    {optionQuantityFields}
    <PurchaseOrderSummary positions={order.positions} />
    {order.positions.map((p, index) => {
      const last = history[p.articleIndex] || p;
      const errors = fieldErrors.positions[index];
      const deliveryDate = String(p.requestedDeliveryDate || '').slice(0, 10);
      const isRejectedDate = rejectedDeliveryDate?.date === deliveryDate
        && rejectedDeliveryDate.loadingLocationText === order.loadingLocationText;
      return <Card key={p.lineId} variant="outlined" sx={{ minWidth: 0, ...(attempted && fieldErrors.articleType ? { borderColor: 'error.main' } : {}) }}><CardContent sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{p.article}</Typography>
          {!fixedPosition && <IconButton size="small" color="primary" aria-label={t('purchase_copy_position')} disabled={disabled || linkedSetup || linkedOrder} onClick={() => copy(p.lineId)}><AddIcon /></IconButton>}
          {!fixedPosition && <IconButton size="small" color="error" aria-label={t('purchase_remove_position')} disabled={disabled || linkedSetup || linkedOrder} onClick={() => removePosition(p.lineId)}><DeleteOutlineIcon /></IconButton>}
        </Box>
        {(p.masterArticleName || last.masterArticleName) && !same(p.article, p.masterArticleName || last.masterArticleName) &&
          <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75, overflowWrap: 'anywhere' }}>{t('purchase_internal_name')}: {p.masterArticleName || last.masterArticleName}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{!isNew?`${t('product_article_index')}: ${p.articleIndex} · `:''}{t('original_packaging_type_label')}: {p.originalPackagingType || '–'}</Typography>
        {!isNew && p.optionId!=null && <Typography variant="caption" color="primary">{t('purchase_option_title')}{p.remainingKg!=null?` · ${t('purchase_available_at_selection')}: ${Number(p.remainingKg).toLocaleString(locale)} kg`:''}</Typography>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1, alignItems: 'end' }}>
          <TextField label={t('purchase_quantity_kg')} required type="number" size="small" error={attempted && errors.amount} value={p.amount} onChange={(e) => patchPosition(p.lineId, { amount: e.target.value, amountTouched: true })} disabled={disabled || linkedOrder} InputProps={{ readOnly: fixedQuantity }} helperText={stockHint} inputProps={{ min: linkedSetup || fixedPosition ? 1 : 0.001, step: linkedSetup || fixedPosition ? 1 : 0.001 }} />
          <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('purchase_last_price')}: {priceText(last.lastPurchasePrice, locale)}</Typography>
            <TextField fullWidth label={t('purchase_price_input')} required type="number" size="small" error={attempted && errors.purchasePrice} value={p.purchasePrice ?? ''} onChange={(e) => patchPosition(p.lineId, { purchasePrice: e.target.value })} disabled={disabled} inputProps={{ min: 0, step: 0.01 }} /></Box>
          <Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{t('purchase_last_delivery')}: {formatDate(last.lastDeliveryDate, lang)}</Typography>
            <TextField fullWidth label={t('purchase_delivery_date')} required type="date" size="small" error={isRejectedDate || (attempted && errors.requestedDeliveryDate)} value={deliveryDate} onChange={(e) => patchPosition(p.lineId, { requestedDeliveryDate: e.target.value })} disabled={disabled} InputLabelProps={{ shrink: true }} /></Box>
        </Box>
        <TextField label={t('purchase_reserved_for')} size="small" value={p.reservedFor || ''} onChange={(e) => patchPosition(p.lineId, { reservedFor: e.target.value })} disabled={disabled} />
        <TextField label={t('purchase_position_note')} size="small" value={p.comment || ''} onChange={(e) => patchPosition(p.lineId, { comment: e.target.value })} disabled={disabled} />
      </CardContent></Card>;
    })}
    {attempted && missing.length > 0 && <Alert severity="error">{fieldErrors.articleType ? t('purchase_one_article_type') : t('purchase_missing_fields')}</Alert>}
    <PurchaseOrderActions>
      <Button variant="outlined" onClick={onContinue} disabled={disabled}>{linkedSetup || fixedPosition ? t('back_label') : t('cart_continue_shopping')}</Button>
      <Button variant="contained" onClick={submit} disabled={saving || (!locked && (loading || locationsLoading || Boolean(error || locationError)))}>{saving ? <CircularProgress size={20} /> : locked ? t('purchase_retry_save') : linkedSetup ? t('procurement_confirm') : isNew ? t('purchase_save_draft') : t('save_label')}</Button>
      {!isNew && onDelete && <Button variant="outlined" color="error" onClick={onDelete} disabled={disabled}>{t('delete_label')}</Button>}
    </PurchaseOrderActions>
    {newLocationOpen && <LoadingLocationDialog
      initialAddress={!locationError && !locations.length && !order.loadingLocationText ? options.supplierAddress : undefined}
      onClose={()=>setNewLocationOpen(false)} onConfirm={text=>{
      setNewLocations(previous=>previous.some(item=>same(item.text,text))?previous:[...previous,{id:`manual:${text}`,text,source:'manual'}]);
      update({loadingLocationId:'',loadingLocationText:text,loadingLocationSource:'manual'});
      setShowLocationDetails(false);setNewLocationOpen(false);
    }} />}
  </Box>;
}

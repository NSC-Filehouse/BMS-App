import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem,TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ContactCreateDialog from './ContactCreateDialog.jsx';
import CompactAddressOption from './CompactAddressOption.jsx';
import LoadingLocationDialog from './LoadingLocationDialog.jsx';
import {getMandant} from '../utils/mandant.js';
import {getSelectableContactRankings} from '../utils/contactRanking.js';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { addPurchaseCartItems,savePurchaseCartContext } from '../utils/purchaseCart.js';
import {confirmedTotalKg,defaultOptionPackagingId,truckOptionAvailability} from '../utils/optionQuantityConfirmation.js';
import {createReturnTo} from '../utils/navigation.js';
import {optionPurchaseReturnTo} from '../utils/optionPurchaseNavigation.js';
import {useI18n} from '../utils/i18n.jsx';
import {optionArticleBlocked,optionPositionTitle,optionQuantity} from '../utils/optionDisplay.js';
import { loadingLocationParts } from '../utils/loadingLocationDisplay.js';

const fieldFontSize='0.8125rem';

export default function OptionPurchaseDialog({ offer, position, preferredSupplierId, supplier: initialSupplier, supplierEditable, article, returnTo, onClose, onPrepared, defaultAmount, stockHint }) {
  const { t, lang } = useI18n();
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const navigate = useNavigate();
  const location=useLocation();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers,setSuppliers] = React.useState(null);
  const [supplierId,setSupplierId] = React.useState(initialSupplier?.id);
  const supplier = supplierEditable && suppliers
    ? (suppliers.find(row => row.id === supplierId) || (supplierId === undefined && (suppliers.find(row => row.preferred) || (suppliers.length === 1 ? suppliers[0] : null))))
    : initialSupplier;
  const [contacts,setContacts]=React.useState([]),[contact,setContact]=React.useState(null);
  const [contactMeta,setContactMeta]=React.useState({}),[contactsLoading,setContactsLoading]=React.useState(false);
  const [contactError,setContactError]=React.useState(''),[contactCreateOpen,setContactCreateOpen]=React.useState(false);
  const [contactNotice,setContactNotice]=React.useState('');
  const contactMandant=getMandant();
  const contactScope=React.useRef(null);contactScope.current={supplierId:supplier?.id,mandant:contactMandant};
  const [orderAmount,setOrderAmount] = React.useState(null);
  const [availability,setAvailability] = React.useState({});
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const [manualLocation, setManualLocation] = React.useState(null);
  const [totalAmount,setTotalAmount]=React.useState('');
  const [totalUnit,setTotalUnit]=React.useState('');
  const [quantityConfirmed,setQuantityConfirmed]=React.useState(false);
  const [quantityEditing,setQuantityEditing]=React.useState(false);
  const [packagingTypeId,setPackagingTypeId]=React.useState('');
  const [packagingTypes,setPackagingTypes]=React.useState([]);
  const [packagingLoading,setPackagingLoading]=React.useState(true);
  const [packagingError,setPackagingError]=React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [errorCode,setErrorCode] = React.useState('');
  const [availabilityLoading,setAvailabilityLoading] = React.useState(true);
  const [availabilityError,setAvailabilityError] = React.useState('');
  React.useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ q: '', supplierId: preferredSupplierId || '' });
    apiRequest(`${base}/suppliers?${query}`, { signal: controller.signal })
      .then(({ data = [], meta = {} }) => {
        if (controller.signal.aborted) return;
        setSuppliers(data);
        setAvailability(meta);
        setPackagingTypeId(defaultOptionPackagingId(meta));
        setTotalAmount(meta.truckOffer ? meta.confirmedTruckCount ?? '' : meta.confirmedQuantityKg ?? '');
        setTotalUnit(meta.truckOffer ? 'truck' : meta.confirmedQuantityKg != null ? 'kg' : '');
      })
      .catch(cause => {
        if (!controller.signal.aborted) setAvailabilityError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      });
    return () => controller.abort();
  }, [base, preferredSupplierId]);
  React.useEffect(()=>{
    let active=true;
    setPackagingLoading(true);setPackagingError('');
    apiRequest('/packaging-types').then(response=>{
      if(active)setPackagingTypes(response.data || []);
    }).catch(cause=>{if(active)setPackagingError(cause.message);})
      .finally(()=>{if(active)setPackagingLoading(false);});
    return()=>{active=false;};
  },[lang]);
  React.useEffect(()=>{
    let active=true;setContacts([]);setContact(null);setContactMeta({});setContactError('');setContactCreateOpen(false);setContactNotice('');
    if(!supplier){setContactsLoading(false);return;}
    setContactsLoading(true);
    apiRequest(`${base}/contacts?${new URLSearchParams({supplierId:supplier.id})}`).then(response=>{
      if(!active)return;setContacts(response.data || []);setContactMeta(response.meta || {});
      setContact((response.data || []).find(row=>row.id===response.meta?.selectedId) || null);
    }).catch(e=>{if(active)setContactError(e.message);}).finally(()=>{if(active)setContactsLoading(false);});
    return()=>{active=false;};
  },[supplier?.id,base,contactMandant]);
  React.useEffect(()=>()=>{contactScope.current=null;},[]);
  const refreshContact=async id=>{
    const scope=contactScope.current;
    const response=await apiRequest(`${base}/contacts?${new URLSearchParams({supplierId:scope.supplierId})}`);
    if(contactScope.current?.supplierId!==scope.supplierId || getMandant()!==scope.mandant)return;
    const found=(response.data || []).find(row=>row.id===Number(id));
    if(!found)throw Error(t('purchase_contact_not_available'));
    setContacts(response.data || []);setContact(found);setContactMeta(response.meta || {});
  };
  const confirmQuantity=async()=>{
    setBusy(true);setError('');
    try {
      const response=await apiRequest(`${base}/quantity`,{method:'POST',body:JSON.stringify({totalAmount,totalUnit,packagingTypeId,
        quantityConfirmed,quantitySourceHash:availability.quantitySourceHash,expectedConfirmedKg:availability.confirmedQuantityKg??null,
        expectedConfirmedPackagingTypeId:availability.confirmedPackagingTypeId??null})});
      setAvailability(previous=>({...previous,...response.data}));
      setTotalAmount(availability.truckOffer?response.data.confirmedTruckCount??'':response.data.confirmedQuantityKg);setTotalUnit(availability.truckOffer?'truck':'kg');setQuantityConfirmed(false);setQuantityEditing(false);setOrderAmount(null);
    }catch(e){setError(e.message);setErrorCode(e.code || '');}finally{setBusy(false);}
  };
  const submit = async () => {
    setBusy(true);setError('');
    try {
      const response = await apiRequest(`${base}/selection`,{method:'POST',body:JSON.stringify({
        supplierId:supplier.id,contactId:contact?.id || null,articleIndex:article.articleIndex,supplierConfirmed:true,articleConfirmed:true,packagingTypeId,amount:requestedAmount,
        ...(manualLocation && pickup && { manualLoadingLocation: manualLocation.text, loadingLocationCity: manualLocation.city }),
      })});
      if (onPrepared) {
        onPrepared(response.data);
        return;
      }
      addPurchaseCartItems([response.data.position],cartReturnTo,response.data.header);
      navigate('/purchase-cart',{state:{returnTo:cartReturnTo}});
    } catch(e){setError(e.message);setErrorCode(e.code || '');} finally{setBusy(false);}
  };
  const cartReturnTo=optionPurchaseReturnTo(returnTo || createReturnTo(location),position.id);
  const pickup = /^(FCA|EXW)\b/i.test(availability.sourceIncoterm || offer.incoterm || '');
  const loadingLocation = manualLocation?.text || availability.sourceLoadingLocation || offer.loadingLocation;
  const selectedPackaging=packagingTypes.find(row=>row.id===Number(packagingTypeId));
  const automaticTruck=availability.truckOffer && Number(availability.offeredTrucks)>0;
  const effectiveAvailability=truckOptionAvailability(availability,selectedPackaging) || availability;
  const requestedAmount=orderAmount ?? defaultAmount ?? effectiveAvailability.remainingKg ?? '';
  const invalidAmount=requestedAmount==='' || !Number.isFinite(Number(requestedAmount)) || Number(requestedAmount)<=0 || Number(requestedAmount)>effectiveAvailability.remainingKg || (onPrepared && (!Number.isSafeInteger(Number(requestedAmount)) || Number(requestedAmount)>Number(defaultAmount)));
  const choicesUnavailable = availabilityLoading || Boolean(availabilityError) || packagingLoading || Boolean(packagingError);
  const unavailable = choicesUnavailable || effectiveAvailability.remainingKg == null || effectiveAvailability.remainingKg<=0 || quantityEditing || !selectedPackaging;
  const enteringQuantity=!automaticTruck && (availability.remainingKg===null || quantityEditing);
  const totalKg=confirmedTotalKg(totalAmount,totalUnit,selectedPackaging);
  return <Dialog open onClose={busy?undefined:onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('purchase_option_title')}</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.5,pt:'8px !important','& .MuiInputBase-root':{fontSize:fieldFontSize}}}>
      <Typography>{optionPositionTitle(position)}</Typography>
      {supplierEditable ? <Autocomplete options={suppliers ?? (initialSupplier ? [initialSupplier] : [])}
        value={supplier ?? null} disabled={busy || availabilityLoading || Boolean(availabilityError)}
        isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionKey={row=>row.id}
        getOptionLabel={row=>`${row.name}${row.city ? ` · ${row.city}` : ''}`}
        noOptionsText={t('supplier_options_unidentified')}
        onChange={(_event,value)=>{setContact(null);setSupplierId(value?.id);}}
        renderInput={params=><TextField {...params} label={t('supplier_label')} required size="small" />} />
        : supplier && <Typography variant="body2">{t('supplier_label')}: {supplier.name}{supplier.city ? ` · ${supplier.city}` : ''}</Typography>}
      {article && <Typography variant="body2">{t('product_article')}: {article.articleName}</Typography>}
      {supplier && <>
        <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
          <Autocomplete sx={{flex:1,minWidth:0}} options={contacts} value={contact} loading={contactsLoading} disabled={busy || contactsLoading}
            getOptionLabel={row=>row.name} getOptionKey={row=>row.id} isOptionEqualToValue={(a,b)=>a.id===b.id}
            onChange={(_e,value)=>setContact(value)} noOptionsText={t('purchase_no_contact')}
            renderOption={({key,...props},row)=><Box component="li" key={key} {...props} sx={{overflowWrap:'anywhere'}}><Box>{row.name}{row.email && <Typography variant="caption" display="block">{row.email}</Typography>}</Box></Box>}
            renderInput={params=><TextField {...params} label={t('contact_label')} size="small" InputLabelProps={{shrink:true}} />} />
          <IconButton aria-label={t('contact_create')} title={t('contact_create')} disabled={busy || contactsLoading || Boolean(contactError)} onClick={()=>setContactCreateOpen(true)}><AddIcon /></IconButton>
        </Box>
        {contactMeta.suggestion && !contact && <Box><Button size="small" disabled={busy || contactsLoading} onClick={()=>setContactCreateOpen(true)}>{t('purchase_review_contact')}</Button><Typography variant="caption" display="block">{[contactMeta.suggestion.vorname,contactMeta.suggestion.name,contactMeta.suggestion.email].filter(Boolean).join(' · ')}</Typography></Box>}
        {contactMeta.status==='ambiguous' && !contact && <Typography variant="caption">{t('purchase_ambiguous_contact')}</Typography>}
        {contactMeta.emailMismatch && contact?.id===contactMeta.selectedId && <Typography variant="caption">{t('purchase_contact_email_mismatch')}</Typography>}
        {contactError && <Alert severity="error">{contactError}</Alert>}
        {contactNotice && <Alert severity="warning">{contactNotice}</Alert>}
      </>}
      {pickup && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">{t('purchase_loading_location')}</Typography>
          {loadingLocation && <CompactAddressOption {...loadingLocationParts(loadingLocation)} />}
        </Box>
        <IconButton color="primary" size="small" disabled={busy} aria-label={t('purchase_new_loading_location')}
          onClick={() => setLocationDialogOpen(true)}><AddCircleOutlineIcon fontSize="small" /></IconButton>
      </Box>}
      {<Box sx={{display:'grid',gap:0.5}}>
        <TextField label={t('packaging_type_label')} required select size="small" disabled={busy || choicesUnavailable} value={selectedPackaging?.id ?? ''} onChange={e=>{
          setPackagingTypeId(e.target.value);setQuantityConfirmed(false);setOrderAmount(null);
          if(!automaticTruck && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false
            && Number(e.target.value)!==Number(availability.confirmedPackagingTypeId))setQuantityEditing(true);
        }}><MenuItem value="" disabled>{t('purchase_packaging_unresolved')}</MenuItem>{packagingTypes.map(row=><MenuItem key={row.id} value={row.id}>{row.text}</MenuItem>)}</TextField>
        {packagingError && <Alert severity="error">{packagingError}</Alert>}
      </Box>}
      <TextField label={t('purchase_order_quantity')} type="number" required size="small" value={requestedAmount} disabled={busy || unavailable}
        error={!unavailable && invalidAmount} inputProps={{min:0.001,max:effectiveAvailability.remainingKg??undefined,step:0.001}}
        helperText={stockHint || (effectiveAvailability.remainingKg!=null?t('purchase_max_available', { amount: Number(effectiveAvailability.remainingKg).toLocaleString(locale) }):(availability.quantityText || optionQuantity(position,t)))}
        onChange={e=>setOrderAmount(e.target.value)} />
      {effectiveAvailability.orderedKg>0 && <Typography variant="body2">{t('purchase_remaining', { amount: Number(effectiveAvailability.remainingKg).toLocaleString(locale) })}</Typography>}
      {!automaticTruck && availability.remainingKg===null && <Alert severity="warning">{availability.truckOffer?t('purchase_missing_trucks'):t('purchase_missing_quantity')}</Alert>}
      {enteringQuantity && <Box sx={{display:'grid',gap:1}}>
        {(availability.quantityText || position.quantityText) && <Typography variant="body2">{t('purchase_source_quantity')}: {availability.quantityText || position.quantityText}</Typography>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0, 1fr)',sm:'minmax(0, 1fr) minmax(150px, 0.65fr)'},gap:1}}>
          <TextField label={availability.truckOffer?t('purchase_offered_trucks'):t('purchase_offered_quantity')} required type="number" size="small" value={totalAmount} disabled={busy}
            inputProps={{min:totalUnit==='t'?0.000001:0.001,step:totalUnit==='t'?0.000001:0.001}} onChange={e=>{setTotalAmount(e.target.value);setQuantityConfirmed(false);}} />
          {availability.truckOffer?<TextField label={t('purchase_offered_quantity_kg')} size="small" value={totalKg??''} InputProps={{readOnly:true}} />:<TextField label={t('product_unit')} required select size="small" value={totalUnit} disabled={busy} onChange={e=>{setTotalUnit(e.target.value);setQuantityConfirmed(false);}}>
            <MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem><MenuItem value="kg">kg</MenuItem><MenuItem value="t">{t('purchase_tonnes')}</MenuItem>
          </TextField>}
        </Box>
        <Typography variant="caption" color="text.secondary">{t('purchase_quantity_scope')}</Typography>
        {totalKg!=null && <Typography variant="body2">{t('purchase_equivalent_kg', { amount: totalKg.toLocaleString(locale,{maximumFractionDigits:3}) })}</Typography>}
        <FormControlLabel control={<Checkbox checked={quantityConfirmed} disabled={busy||totalKg==null||availability.truckOffer&&!selectedPackaging} onChange={e=>setQuantityConfirmed(e.target.checked)} />}
          label={availability.truckOffer?t('purchase_confirm_trucks'):t('purchase_confirm_amount')} />
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap'}}><Button variant="outlined" disabled={busy||!quantityConfirmed||totalKg==null||availability.truckOffer&&!selectedPackaging} onClick={confirmQuantity}>{t('purchase_confirm_quantity')}</Button>
          {quantityEditing && <Button disabled={busy} onClick={()=>{setQuantityEditing(false);setQuantityConfirmed(false);setTotalAmount(availability.truckOffer?availability.confirmedTruckCount??'':availability.confirmedQuantityKg??'');setTotalUnit(availability.truckOffer?'truck':'kg');setPackagingTypeId(defaultOptionPackagingId(availability));}}>{t('purchase_discard_change')}</Button>}</Box>
      </Box>}
      {!automaticTruck && !enteringQuantity && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false && <Box><Typography variant="body2">{t('purchase_confirmed_quantity')}: {Number(availability.confirmedQuantityKg).toLocaleString(locale)} kg</Typography><Button size="small" disabled={busy} onClick={()=>setQuantityEditing(true)}>{t('purchase_correct_quantity')}</Button></Box>}
      {effectiveAvailability.remainingKg===0 && <Alert severity="warning">{t('purchase_fully_allocated')}</Alert>}
      {(busy || availabilityLoading) && <CircularProgress size={22} />}
      {availabilityError && <Alert severity="error">{availabilityError}</Alert>}
      {error && <Alert severity="error">{error}
        {['PURCHASE_CART_SUPPLIER_CONFLICT', 'PURCHASE_CART_LOCATION_CONFLICT'].includes(errorCode) && <Link component={RouterLink} to="/purchase-cart" state={{returnTo:cartReturnTo}} onClick={()=>savePurchaseCartContext({returnTo:cartReturnTo})} sx={{display:'block',mt:1}}>{t('purchase_open_cart')}</Link>}
      </Alert>}
    </DialogContent>
    {locationDialogOpen && <LoadingLocationDialog onClose={() => setLocationDialogOpen(false)} onConfirm={(text, city) => {
      setManualLocation({ text, city });
      setLocationDialogOpen(false);
    }} />}
    <DialogActions><Button disabled={busy} onClick={onClose}>{t('purchase_cancel')}</Button><Button variant="contained" disabled={busy||contactsLoading||Boolean(contactError)||unavailable||invalidAmount||!supplier||!article||optionArticleBlocked(article)} onClick={submit}>{onPrepared ? t('procurement_continue') : t('purchase_to_cart')}</Button></DialogActions>
    {contactCreateOpen && supplier && <ContactCreateDialog key={`${supplier.id}:${contactMandant}`} customerId={supplier.id} customerName={supplier.name}
      mandant={contactMandant} rankings={getSelectableContactRankings(contacts)} initialContact={contactMeta.suggestion}
      onClose={()=>setContactCreateOpen(false)} onExisting={refreshContact}
      onCreated={async(id,warnings)=>{await refreshContact(id);setContactNotice((warnings || []).map(w=>typeof w==='string'?w:w.nachricht || w.detail || '').filter(Boolean).join(' '));}} />}
  </Dialog>;
}

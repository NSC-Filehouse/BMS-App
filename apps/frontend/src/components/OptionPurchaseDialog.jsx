import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem,TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import ContactCreateDialog from './ContactCreateDialog.jsx';
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

const fieldFontSize='0.8125rem';

export default function OptionPurchaseDialog({ offer, position, preferredSupplierId, returnTo, onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location=useLocation();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers,setSuppliers] = React.useState([]);
  const [supplier,setSupplier] = React.useState(null);
  const [contacts,setContacts]=React.useState([]),[contact,setContact]=React.useState(null);
  const [contactMeta,setContactMeta]=React.useState({}),[contactsLoading,setContactsLoading]=React.useState(false);
  const [contactError,setContactError]=React.useState(''),[contactCreateOpen,setContactCreateOpen]=React.useState(false);
  const [contactNotice,setContactNotice]=React.useState('');
  const contactMandant=getMandant();
  const contactScope=React.useRef(null);contactScope.current={supplierId:supplier?.id,mandant:contactMandant};
  const [showArticleSearch,setShowArticleSearch] = React.useState(false);
  const articleSearchId=React.useId();
  const [articles,setArticles] = React.useState([]);
  const [article,setArticle] = React.useState(null);
  const [articleQuery,setArticleQuery] = React.useState('');
  const [articlesLoaded,setArticlesLoaded] = React.useState(false);
  const [articlesLoading,setArticlesLoading] = React.useState(false);
  const [orderAmount,setOrderAmount] = React.useState(null);
  const [availability,setAvailability] = React.useState({});
  const [totalAmount,setTotalAmount]=React.useState('');
  const [totalUnit,setTotalUnit]=React.useState('');
  const [quantityConfirmed,setQuantityConfirmed]=React.useState(false);
  const [quantityEditing,setQuantityEditing]=React.useState(false);
  const [packagingTypeId,setPackagingTypeId]=React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [errorCode,setErrorCode] = React.useState('');
  const loadSuppliers = async (q = '') => {
    setBusy(true);setError('');
    try {
      const query = new URLSearchParams({q,supplierId:preferredSupplierId || ''});
      const response = await apiRequest(`${base}/suppliers?${query}`);
      const rows = response.data || [];
      setSuppliers(rows);setAvailability(response.meta || {});
      if(!q){
        const meta=response.meta || {};
        setPackagingTypeId(defaultOptionPackagingId(meta));
        setTotalAmount(meta.truckOffer?meta.confirmedTruckCount??'':meta.confirmedQuantityKg??'');
        setTotalUnit(meta.truckOffer?'truck':meta.confirmedQuantityKg!=null?'kg':'');
      }
      if (!q) setSupplier(rows.find(row=>row.preferred) || (rows.length===1?rows[0]:null));
      return response;
    } catch(e){setError(e.message);setErrorCode(e.code || '');} finally{setBusy(false);}
  };
  const loadArticles = async (q = '') => {
    setBusy(true);setError('');setArticlesLoading(true);
    setArticlesLoaded(false);setArticles([]);setArticle(null);
    try {
      const response = await apiRequest(`${base}/articles?${new URLSearchParams({q})}`);
      const rows=response.data || [];
      setArticles(rows);setArticlesLoaded(true);
      setArticle(rows.length===1&&!optionArticleBlocked(rows[0])?rows[0]:null);
      return response;
    } catch(e){setError(e.message);setErrorCode(e.code || '');} finally{setBusy(false);setArticlesLoading(false);}
  };
  React.useEffect(()=>{void(async()=>{await loadSuppliers();await loadArticles();})();},[]);
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
    if(!found)throw Error('Der Ansprechpartner wurde gespeichert, ist aber noch nicht verfügbar. Bitte erneut prüfen.');
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
      })});
      addPurchaseCartItems([response.data.position],cartReturnTo,response.data.header);
      navigate('/purchase-cart',{state:{returnTo:cartReturnTo}});
    } catch(e){setError(e.message);setErrorCode(e.code || '');} finally{setBusy(false);}
  };
  const cartReturnTo=optionPurchaseReturnTo(returnTo || createReturnTo(location),position.id);
  const selectedPackaging=availability.packagingTypes?.find(row=>row.id===Number(packagingTypeId));
  const automaticTruck=availability.truckOffer && Number(availability.offeredTrucks)>0;
  const effectiveAvailability=truckOptionAvailability(availability,selectedPackaging) || availability;
  const requestedAmount=orderAmount ?? effectiveAvailability.remainingKg ?? '';
  const invalidAmount=requestedAmount==='' || !Number.isFinite(Number(requestedAmount)) || Number(requestedAmount)<=0 || Number(requestedAmount)>effectiveAvailability.remainingKg;
  const unavailable = effectiveAvailability.remainingKg == null || effectiveAvailability.remainingKg<=0 || quantityEditing || !selectedPackaging;
  const enteringQuantity=!automaticTruck && (availability.remainingKg===null || quantityEditing);
  const totalKg=confirmedTotalKg(totalAmount,totalUnit,selectedPackaging);
  return <Dialog open onClose={busy?undefined:onClose} fullWidth maxWidth="sm">
    <DialogTitle>Bestellung (Option)</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.5,pt:'8px !important','& .MuiInputBase-root':{fontSize:fieldFontSize}}}>
      <Typography>{optionPositionTitle(position)}</Typography>
      {suppliers.length>1 && !supplier && <Typography variant="body2">Anbieter: {offer.supplierName}. Bitte das passende BMS-Lieferantenkonto wählen.</Typography>}
      <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
      <Autocomplete options={suppliers} value={supplier} disabled={busy} sx={{flex:1,minWidth:0}}
        isOptionEqualToValue={(a,b)=>a.id===b.id}
        getOptionKey={row=>row.id}
        getOptionLabel={row=>`${row.name}${row.city?` · ${row.city}`:''}`}
        renderOption={({key,...props},row)=><Box component="li" key={key} {...props} sx={{fontSize:fieldFontSize,overflowWrap:'anywhere'}}>{row.name}{row.city?` · ${row.city}`:''}</Box>}
        onChange={(_e,value)=>{setSupplier(value);setArticle(articles.length===1&&!optionArticleBlocked(articles[0])?articles[0]:null);}}
        renderInput={params=><TextField {...params} label="Lieferant" required size="small" />} />
      </Box>
      {supplier && <>
        <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
          <Autocomplete sx={{flex:1,minWidth:0}} options={contacts} value={contact} loading={contactsLoading} disabled={busy || contactsLoading}
            getOptionLabel={row=>row.name} getOptionKey={row=>row.id} isOptionEqualToValue={(a,b)=>a.id===b.id}
            onChange={(_e,value)=>setContact(value)} noOptionsText="Kein Ansprechpartner hinterlegt"
            renderOption={({key,...props},row)=><Box component="li" key={key} {...props} sx={{fontSize:fieldFontSize,overflowWrap:'anywhere'}}><Box>{row.name}{row.email && <Typography variant="caption" display="block">{row.email}</Typography>}</Box></Box>}
            renderInput={params=><TextField {...params} label="Ansprechpartner" size="small" InputLabelProps={{shrink:true}} />} />
          <IconButton aria-label="Ansprechpartner anlegen" title="Ansprechpartner anlegen" disabled={busy || contactsLoading || Boolean(contactError)} onClick={()=>setContactCreateOpen(true)}><AddIcon /></IconButton>
        </Box>
        {contactMeta.suggestion && !contact && <Box><Button size="small" disabled={busy || contactsLoading} onClick={()=>setContactCreateOpen(true)}>Kontaktvorschlag prüfen</Button><Typography variant="caption" display="block">{[contactMeta.suggestion.vorname,contactMeta.suggestion.name,contactMeta.suggestion.email].filter(Boolean).join(' · ')}</Typography></Box>}
        {contactMeta.status==='ambiguous' && !contact && <Typography variant="caption">Ansprechpartner nicht eindeutig. Bitte auswählen.</Typography>}
        {contactMeta.emailMismatch && contact?.id===contactMeta.selectedId && <Typography variant="caption">Kontakt anhand des vollständigen Namens erkannt. Die Mailadresse im Angebot weicht vom gespeicherten Kontakt ab. Bitte prüfen.</Typography>}
        {contactError && <Alert severity="error">{contactError}</Alert>}
        {contactNotice && <Alert severity="warning">{contactNotice}</Alert>}
      </>}
        {articlesLoading && <Typography variant="body2" role="status">Artikel werden geladen …</Typography>}
        {articlesLoaded && !articles.length && <Typography variant="body2">Kein passender Artikel gefunden. Bitte die Artikelsuche öffnen.</Typography>}
        <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
        <Autocomplete options={articles} value={article} disabled={busy} sx={{flex:1,minWidth:0}} isOptionEqualToValue={(a,b)=>a.articleIndex===b.articleIndex}
          loading={articlesLoading} loadingText="Artikel werden geladen …"
          getOptionLabel={row=>row.articleName}
          getOptionDisabled={row=>optionArticleBlocked(row)}
          noOptionsText="Kein passender Artikel gefunden. Bitte die Artikelsuche über die Lupe öffnen."
          renderOption={({key,...props},row)=><Box key={key} component="li" {...props} sx={{display:'block !important',overflowWrap:'anywhere'}}><Typography sx={{fontSize:fieldFontSize}}>{row.articleName}</Typography>{optionArticleBlocked(row) && <Typography variant="caption" color="error">{[...(row.mfiCheck?.reasons || []),...(row.materialCheck?.reasons || [])].join('; ') || 'Artikel widerspricht der Option'}</Typography>}</Box>}
          onChange={(_e,value)=>setArticle(value)}
          renderInput={params=><TextField {...params} label="Artikel" placeholder="Bitte Artikel auswählen" required size="small" />} />
        <IconButton aria-label="Artikel suchen" title="Artikel suchen" aria-expanded={showArticleSearch} aria-controls={articleSearchId} disabled={busy} onClick={()=>setShowArticleSearch(value=>!value)}><SearchIcon /></IconButton>
        </Box>
        {showArticleSearch && <Box id={articleSearchId} sx={{display:'flex',gap:1}}><TextField autoFocus size="small" fullWidth label="Artikelsuche" placeholder="Name oder Artikelnummer" value={articleQuery} onChange={e=>setArticleQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&articleQuery.trim().length>=2)void loadArticles(articleQuery.trim());}} /><Button disabled={busy||articleQuery.trim().length<2} onClick={()=>loadArticles(articleQuery.trim())}>Suchen</Button></Box>}
      {<Box sx={{display:'grid',gap:0.5}}>
        <TextField label="Verpackungsart" required select size="small" disabled={busy} value={packagingTypeId} onChange={e=>{
          setPackagingTypeId(e.target.value);setQuantityConfirmed(false);setOrderAmount(null);
          if(!automaticTruck && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false
            && Number(e.target.value)!==Number(availability.confirmedPackagingTypeId))setQuantityEditing(true);
        }}><MenuItem value="" disabled sx={{fontSize:fieldFontSize}}>ungeklärt</MenuItem>{availability.packagingTypes?.map(row=><MenuItem key={row.id} value={row.id} sx={{fontSize:fieldFontSize}}>{row.text}</MenuItem>)}</TextField>
      </Box>}
      <TextField label="Bestellmenge (kg)" type="number" required size="small" value={requestedAmount} disabled={busy || unavailable}
        error={!unavailable && invalidAmount} inputProps={{min:0.001,max:effectiveAvailability.remainingKg??undefined,step:0.001}}
        helperText={effectiveAvailability.remainingKg!=null?`Maximal verfügbar: ${Number(effectiveAvailability.remainingKg).toLocaleString('de-DE')} kg`:(availability.quantityText || optionQuantity(position,t))}
        onChange={e=>setOrderAmount(e.target.value)} />
      {effectiveAvailability.orderedKg>0 && <Typography variant="body2">Noch verfügbar: {Number(effectiveAvailability.remainingKg).toLocaleString('de-DE')} kg.</Typography>}
      {!automaticTruck && availability.remainingKg===null && <Alert severity="warning">{availability.truckOffer?'Die Option nennt keine Truck-Anzahl. Bitte die angebotene Anzahl eingeben und bestätigen; die kg-Menge wird automatisch berechnet.':'Die Option nennt keine eindeutige Gesamtmenge in kg. Bitte Gesamtmenge und Einheit unten eingeben und bestätigen.'}</Alert>}
      {enteringQuantity && <Box sx={{display:'grid',gap:1}}>
        {(availability.quantityText || position.quantityText) && <Typography variant="body2">Mengenangabe der Option: {availability.quantityText || position.quantityText}</Typography>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0, 1fr)',sm:'minmax(0, 1fr) minmax(150px, 0.65fr)'},gap:1}}>
          <TextField label={availability.truckOffer?'Angebotene Anzahl Trucks':'Angebotene Gesamtmenge'} required type="number" size="small" value={totalAmount} disabled={busy}
            inputProps={{min:totalUnit==='t'?0.000001:0.001,step:totalUnit==='t'?0.000001:0.001}} onChange={e=>{setTotalAmount(e.target.value);setQuantityConfirmed(false);}} />
          {availability.truckOffer?<TextField label="Angebotene Gesamtmenge (kg)" size="small" value={totalKg??''} InputProps={{readOnly:true}} />:<TextField label="Einheit" required select size="small" value={totalUnit} disabled={busy} onChange={e=>{setTotalUnit(e.target.value);setQuantityConfirmed(false);}}>
            <MenuItem value="" disabled sx={{fontSize:fieldFontSize}}>Bitte wählen</MenuItem><MenuItem value="kg" sx={{fontSize:fieldFontSize}}>kg</MenuItem><MenuItem value="t" sx={{fontSize:fieldFontSize}}>t (Tonnen)</MenuItem>
          </TextField>}
        </Box>
        <Typography variant="caption" color="text.secondary">Gesamtmenge dieser Optionsposition, nicht nur die Menge deiner Teilbestellung.</Typography>
        {totalKg!=null && <Typography variant="body2">Entspricht {totalKg.toLocaleString('de-DE',{maximumFractionDigits:3})} kg.</Typography>}
        <FormControlLabel control={<Checkbox checked={quantityConfirmed} disabled={busy||totalKg==null||availability.truckOffer&&!selectedPackaging} onChange={e=>setQuantityConfirmed(e.target.checked)} />}
          label={availability.truckOffer?'Ich habe die angebotene Truck-Anzahl geprüft und bestätige die Gesamtmenge.':'Ich habe die angebotene Gesamtmenge geprüft und bestätige Menge und Einheit.'} />
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap'}}><Button variant="outlined" disabled={busy||!quantityConfirmed||totalKg==null||availability.truckOffer&&!selectedPackaging} onClick={confirmQuantity}>Gesamtmenge bestätigen</Button>
          {quantityEditing && <Button disabled={busy} onClick={()=>{setQuantityEditing(false);setQuantityConfirmed(false);setTotalAmount(availability.truckOffer?availability.confirmedTruckCount??'':availability.confirmedQuantityKg??'');setTotalUnit(availability.truckOffer?'truck':'kg');setPackagingTypeId(defaultOptionPackagingId(availability));}}>Änderung verwerfen</Button>}</Box>
      </Box>}
      {!automaticTruck && !enteringQuantity && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false && <Box><Typography variant="body2">Bestätigte angebotene Gesamtmenge: {Number(availability.confirmedQuantityKg).toLocaleString('de-DE')} kg</Typography><Button size="small" disabled={busy} onClick={()=>setQuantityEditing(true)}>Gesamtmenge korrigieren</Button></Box>}
      {effectiveAvailability.remainingKg===0 && <Alert severity="warning">Diese Optionsposition ist bereits vollständig verplant.</Alert>}
      {busy && <CircularProgress size={22} />}
      {error && <Alert severity="error">{error}
        {errorCode==='PURCHASE_CART_SUPPLIER_CONFLICT' && <Link component={RouterLink} to="/purchase-cart" state={{returnTo:cartReturnTo}} onClick={()=>savePurchaseCartContext({returnTo:cartReturnTo})} sx={{display:'block',mt:1}}>Zum Bestellwarenkorb</Link>}
      </Alert>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Abbrechen</Button><Button variant="contained" disabled={busy||contactsLoading||Boolean(contactError)||unavailable||invalidAmount||!supplier||!article||optionArticleBlocked(article)} onClick={submit}>In den Bestellwarenkorb</Button></DialogActions>
    {contactCreateOpen && supplier && <ContactCreateDialog key={`${supplier.id}:${contactMandant}`} customerId={supplier.id} customerName={supplier.name}
      mandant={contactMandant} rankings={getSelectableContactRankings(contacts)} initialContact={contactMeta.suggestion}
      onClose={()=>setContactCreateOpen(false)} onExisting={refreshContact}
      onCreated={async(id,warnings)=>{await refreshContact(id);setContactNotice((warnings || []).map(w=>typeof w==='string'?w:w.nachricht || w.detail || '').filter(Boolean).join(' '));}} />}
  </Dialog>;
}

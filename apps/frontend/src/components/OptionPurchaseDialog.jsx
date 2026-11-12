import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { addPurchaseCartItems,defaultPurchaseAmount } from '../utils/purchaseCart.js';
import {confirmedTotalKg,defaultOptionPackagingId,truckOptionAvailability} from '../utils/optionQuantityConfirmation.js';

export default function OptionPurchaseDialog({ offer, position, preferredSupplierId, returnTo, onClose }) {
  const navigate = useNavigate();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers,setSuppliers] = React.useState([]);
  const [supplier,setSupplier] = React.useState(null);
  const [showSupplierSearch,setShowSupplierSearch] = React.useState(false);
  const [showArticleSearch,setShowArticleSearch] = React.useState(false);
  const supplierSearchId=React.useId();
  const articleSearchId=React.useId();
  const [supplierQuery,setSupplierQuery] = React.useState('');
  const [articles,setArticles] = React.useState([]);
  const [article,setArticle] = React.useState(null);
  const [articleQuery,setArticleQuery] = React.useState('');
  const [activeArticleQuery,setActiveArticleQuery] = React.useState('');
  const [articleTotal,setArticleTotal] = React.useState(0);
  const [articlesLoaded,setArticlesLoaded] = React.useState(false);
  const [articlesLoading,setArticlesLoading] = React.useState(false);
  const [acknowledgeUnverifiedMfi,setAcknowledgeUnverifiedMfi] = React.useState(false);
  const [availability,setAvailability] = React.useState({});
  const [totalAmount,setTotalAmount]=React.useState('');
  const [totalUnit,setTotalUnit]=React.useState('');
  const [quantityConfirmed,setQuantityConfirmed]=React.useState(false);
  const [quantityEditing,setQuantityEditing]=React.useState(false);
  const [packagingTypeId,setPackagingTypeId]=React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
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
    } catch(e){setError(e.message);} finally{setBusy(false);}
  };
  const loadArticles = async (q = '') => {
    setBusy(true);setError('');setArticlesLoading(true);
    setArticlesLoaded(false);setArticles([]);setActiveArticleQuery(q);
    try {
      const response = await apiRequest(`${base}/articles?${new URLSearchParams({q})}`);
      const rows=response.data || [];
      setArticles(rows);setArticleTotal(rows.length);setArticlesLoaded(true);
    } catch(e){setError(e.message);} finally{setBusy(false);setArticlesLoading(false);}
  };
  React.useEffect(()=>{void(async()=>{await loadSuppliers();await loadArticles();})();},[]);
  const confirmQuantity=async()=>{
    setBusy(true);setError('');
    try {
      const response=await apiRequest(`${base}/quantity`,{method:'POST',body:JSON.stringify({totalAmount,totalUnit,packagingTypeId,
        quantityConfirmed,quantitySourceHash:availability.quantitySourceHash,expectedConfirmedKg:availability.confirmedQuantityKg??null,
        expectedConfirmedPackagingTypeId:availability.confirmedPackagingTypeId??null})});
      setAvailability(previous=>({...previous,...response.data}));
      setTotalAmount(availability.truckOffer?response.data.confirmedTruckCount??'':response.data.confirmedQuantityKg);setTotalUnit(availability.truckOffer?'truck':'kg');setQuantityConfirmed(false);setQuantityEditing(false);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const submit = async () => {
    setBusy(true);setError('');
    try {
      const response = await apiRequest(`${base}/selection`,{method:'POST',body:JSON.stringify({
        supplierId:supplier.id,articleIndex:article.articleIndex,supplierConfirmed:true,articleConfirmed:true,acknowledgeUnverifiedMfi,packagingTypeId,
      })});
      addPurchaseCartItems([response.data.position],returnTo,response.data.header);
      navigate('/purchase-cart',{state:{returnTo}});
    } catch(e){setError(e.message);} finally{setBusy(false);}
  };
  const selectedPackaging=availability.packagingTypes?.find(row=>row.id===Number(packagingTypeId));
  const automaticTruck=availability.truckOffer && Number(availability.offeredTrucks)>0;
  const effectiveAvailability=truckOptionAvailability(availability,selectedPackaging) || availability;
  const unavailable = effectiveAvailability.remainingKg == null || effectiveAvailability.remainingKg<=0 || quantityEditing || availability.truckOffer && !selectedPackaging;
  const enteringQuantity=!automaticTruck && (availability.remainingKg===null || quantityEditing);
  const totalKg=confirmedTotalKg(totalAmount,totalUnit,selectedPackaging);
  return <Dialog open onClose={busy?undefined:onClose} fullWidth maxWidth="sm">
    <DialogTitle>Bestellung (Option)</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.5,pt:'8px !important'}}>
      <Typography>{position.articleName} · {offer.supplierName}</Typography>
      <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
      <Autocomplete options={suppliers} value={supplier} disabled={busy} sx={{flex:1,minWidth:0}}
        isOptionEqualToValue={(a,b)=>a.id===b.id}
        getOptionLabel={row=>`${row.name} (${row.id})${row.city?` · ${row.city}`:''}`}
        onChange={(_e,value)=>{setSupplier(value);setArticle(null);setAcknowledgeUnverifiedMfi(false);}}
        renderInput={params=><TextField {...params} label="Lieferant" required size="small" />} />
      <IconButton aria-label="Lieferanten suchen" title="Lieferanten suchen" aria-expanded={showSupplierSearch} aria-controls={supplierSearchId} disabled={busy} onClick={()=>setShowSupplierSearch(value=>!value)}><SearchIcon /></IconButton>
      </Box>
      {supplier?.reason && <Typography variant="caption">{supplier.reason}</Typography>}
      {showSupplierSearch && <Box id={supplierSearchId} sx={{display:'flex',gap:1}}><TextField autoFocus size="small" fullWidth label="Lieferantensuche" placeholder="Name oder Lieferantennummer" value={supplierQuery} onChange={e=>setSupplierQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&supplierQuery.trim().length>=2)void loadSuppliers(supplierQuery.trim());}} /><Button disabled={busy||supplierQuery.trim().length<2} onClick={()=>loadSuppliers(supplierQuery.trim())}>Suchen</Button></Box>}
        <Typography variant="body2" role="status">{!articlesLoaded
          ?error&&!articlesLoading?'Artikelvorschläge konnten nicht geladen werden.':'Artikelvorschläge werden geladen …'
          :activeArticleQuery
            ?articles.length?`${articleTotal} Artikel zur Suche „${activeArticleQuery}“ gefunden. Bitte einen Artikel auswählen.`:'Kein Artikel zur Suche gefunden. Bitte den Namen oder die Artikelnummer ändern.'
            :articles.length?`${articleTotal===1?'Ein Artikel wurde':`${articleTotal} Artikel wurden`} für diese Option vorgeschlagen. Bitte einen Artikel auswählen.`:'Kein passender Artikel gefunden. Bitte über die Lupe nach Namen oder Artikelnummer suchen.'}</Typography>
        <Box sx={{display:'flex',gap:1,alignItems:'flex-start'}}>
        <Autocomplete options={articles} value={article} disabled={busy} sx={{flex:1,minWidth:0}} isOptionEqualToValue={(a,b)=>a.articleIndex===b.articleIndex}
          loading={articlesLoading} loadingText="Artikel werden geladen …"
          getOptionLabel={row=>`${row.articleName} (${row.articleIndex})`}
          getOptionDisabled={row=>Boolean(row.mfiCheck?.blocked)}
          noOptionsText="Kein passender Artikel gefunden. Bitte die Artikelsuche über die Lupe öffnen."
          renderOption={(props,row)=><Box component="li" {...props} sx={{display:'block !important'}}><Typography variant="body2">{row.articleName} ({row.articleIndex})</Typography>{row.mfiCheck?.blocked && <Typography variant="caption" color="error">{row.mfiCheck.reasons?.join('; ') || 'MFI widerspricht der Option'}</Typography>}</Box>}
          onChange={(_e,value)=>{setArticle(value);setAcknowledgeUnverifiedMfi(false);}}
          renderInput={params=><TextField {...params} label="Artikel" placeholder="Bitte Artikel auswählen" required size="small" />} />
        <IconButton aria-label="Artikel suchen" title="Artikel suchen" aria-expanded={showArticleSearch} aria-controls={articleSearchId} disabled={busy} onClick={()=>setShowArticleSearch(value=>!value)}><SearchIcon /></IconButton>
        </Box>
        {showArticleSearch && <Box id={articleSearchId} sx={{display:'flex',gap:1}}><TextField autoFocus size="small" fullWidth label="Artikelsuche" placeholder="Name oder Artikelnummer" value={articleQuery} onChange={e=>setArticleQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&articleQuery.trim().length>=2)void loadArticles(articleQuery.trim());}} /><Button disabled={busy||articleQuery.trim().length<2} onClick={()=>loadArticles(articleQuery.trim())}>Suchen</Button></Box>}
        {article?.reason && <Typography variant="caption">{article.reason}</Typography>}
        {article && !article.mfiCheck?.complete && <FormControlLabel control={<Checkbox checked={acknowledgeUnverifiedMfi} disabled={busy} onChange={e=>setAcknowledgeUnverifiedMfi(e.target.checked)} />} label="MFI-Eignung ist wegen fehlender Messwerte oder Prüfbedingungen ungeprüft. Ich bestätige die Auswahl trotzdem." />}
      {availability.truckOffer && <Box sx={{display:'grid',gap:0.5}}>
        <TextField label="Verpackungsart" required select size="small" disabled={busy} value={packagingTypeId} onChange={e=>{
          setPackagingTypeId(e.target.value);setQuantityConfirmed(false);
          if(!automaticTruck && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false
            && Number(e.target.value)!==Number(availability.confirmedPackagingTypeId))setQuantityEditing(true);
        }}><MenuItem value="" disabled>Bitte zuerst wählen</MenuItem>{availability.packagingTypes?.map(row=><MenuItem key={row.id} value={row.id}>{row.text}</MenuItem>)}</TextField>
        {availability.sourcePackaging && <Typography variant="caption" color="text.secondary">Erkannte Verpackung der Option: {availability.sourcePackaging}</Typography>}
        {availability.sourcePackagingSource==='original' && availability.sourcePackagingEvidence && <Typography variant="caption" color="text.secondary">Originalangabe: {availability.sourcePackagingEvidence}</Typography>}
        {availability.sourcePackagingSource==='history' && <Typography variant="caption" color="text.secondary">Aus bisherigen Einkäufen dieses Lieferanten und Produkts abgeleitet.</Typography>}
        <Typography variant="body2">{selectedPackaging?`1 Truck = ${defaultPurchaseAmount(selectedPackaging.text).toLocaleString('de-DE')} kg`:'Bitte die Verpackungsart auswählen. Siloware: 25.000 kg je Truck; andere Arten: 24.750 kg.'}</Typography>
      </Box>}
      {automaticTruck && <Box sx={{display:'grid',gap:1}}>
        <TextField label="Angebotene Gesamtmenge (kg)" size="small" value={selectedPackaging?effectiveAvailability.offeredKg??'':''} InputProps={{readOnly:true}} />
        <Typography variant="caption">{availability.offeredTrucks} {Number(availability.offeredTrucks)===1?'Truck':'Trucks'} laut Option. Die kg-Menge wird automatisch aus Anzahl und Verpackungsart berechnet.</Typography>
      </Box>}
      {effectiveAvailability.remainingKg!=null && <Typography variant="body2">Noch verfügbar: {Number(effectiveAvailability.remainingKg).toLocaleString('de-DE')} kg. Gespeicherte Bestellungen und Entwürfe sind berücksichtigt.</Typography>}
      {!automaticTruck && availability.remainingKg===null && <Alert severity="warning">{availability.truckOffer?'Die Option nennt keine Truck-Anzahl. Bitte die angebotene Anzahl eingeben und bestätigen; die kg-Menge wird automatisch berechnet.':'Die Option nennt keine eindeutige Gesamtmenge in kg. Bitte Gesamtmenge und Einheit unten eingeben und bestätigen.'}</Alert>}
      {enteringQuantity && <Box sx={{display:'grid',gap:1}}>
        {(availability.quantityText || position.quantityText) && <Typography variant="body2">Mengenangabe der Option: {availability.quantityText || position.quantityText}</Typography>}
        {!availability.truckOffer && availability.maxTruckLoadKg!=null && <Typography variant="caption" color="text.secondary">Maximales Ladegewicht je LKW: {Number(availability.maxTruckLoadKg).toLocaleString('de-DE')} kg. Dies ist keine bestätigte Angebotsmenge.</Typography>}
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0, 1fr)',sm:'minmax(0, 1fr) minmax(150px, 0.65fr)'},gap:1}}>
          <TextField label={availability.truckOffer?'Angebotene Anzahl Trucks':'Angebotene Gesamtmenge'} required type="number" size="small" value={totalAmount} disabled={busy}
            inputProps={{min:totalUnit==='t'?0.000001:0.001,step:totalUnit==='t'?0.000001:0.001}} onChange={e=>{setTotalAmount(e.target.value);setQuantityConfirmed(false);}} />
          {availability.truckOffer?<TextField label="Angebotene Gesamtmenge (kg)" size="small" value={totalKg??''} InputProps={{readOnly:true}} />:<TextField label="Einheit" required select size="small" value={totalUnit} disabled={busy} onChange={e=>{setTotalUnit(e.target.value);setQuantityConfirmed(false);}}>
            <MenuItem value="" disabled>Bitte wählen</MenuItem><MenuItem value="kg">kg</MenuItem><MenuItem value="t">t (Tonnen)</MenuItem>
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
      {error && <Alert severity="error">{error}</Alert>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Abbrechen</Button><Button variant="contained" disabled={busy||unavailable||!supplier||!article||article.mfiCheck?.blocked||(!article.mfiCheck?.complete&&!acknowledgeUnverifiedMfi)} onClick={submit}>In den Bestellwarenkorb</Button></DialogActions>
  </Dialog>;
}

import React from 'react';
import { Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { addPurchaseCartItems } from '../utils/purchaseCart.js';

export default function OptionPurchaseDialog({ offer, position, preferredSupplierId, returnTo, onClose }) {
  const navigate = useNavigate();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers,setSuppliers] = React.useState([]);
  const [supplier,setSupplier] = React.useState(null);
  const [supplierConfirmed,setSupplierConfirmed] = React.useState(false);
  const [supplierQuery,setSupplierQuery] = React.useState('');
  const [articles,setArticles] = React.useState([]);
  const [article,setArticle] = React.useState(null);
  const [articleQuery,setArticleQuery] = React.useState('');
  const [articlePage,setArticlePage] = React.useState(1);
  const [activeArticleQuery,setActiveArticleQuery] = React.useState('');
  const [articleTotal,setArticleTotal] = React.useState(0);
  const [acknowledgeUnverifiedMfi,setAcknowledgeUnverifiedMfi] = React.useState(false);
  const [availability,setAvailability] = React.useState({});
  const [totalKg,setTotalKg]=React.useState('');
  const [quantityConfirmed,setQuantityConfirmed]=React.useState(false);
  const [quantityEditing,setQuantityEditing]=React.useState(false);
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const loadSuppliers = async (q = '') => {
    setBusy(true);setError('');
    try {
      const query = new URLSearchParams({q,supplierId:preferredSupplierId || ''});
      const response = await apiRequest(`${base}/suppliers?${query}`);
      const rows = response.data || [];
      setSuppliers(rows);setAvailability(response.meta || {});
      if(!q)setTotalKg(response.meta?.confirmedQuantityKg??'');
      if (!q) setSupplier(rows.find(row=>row.preferred) || (rows.length===1?rows[0]:null));
    } catch(e){setError(e.message);} finally{setBusy(false);}
  };
  const loadArticles = async (q = '',page = 1) => {
    setBusy(true);setError('');
    try {
      const response = await apiRequest(`${base}/articles?${new URLSearchParams({q,page:String(page)})}`);
      setArticles(previous=>page===1?response.data || []:[...previous,...(response.data || [])]);
      setArticlePage(page);setArticleTotal(Number(response.meta?.total || 0));
      setActiveArticleQuery(q);
    } catch(e){setError(e.message);} finally{setBusy(false);}
  };
  React.useEffect(()=>{void loadSuppliers();},[]);
  React.useEffect(()=>{if(supplierConfirmed)void loadArticles();},[supplierConfirmed]);
  const confirmQuantity=async()=>{
    setBusy(true);setError('');
    try {
      const response=await apiRequest(`${base}/quantity`,{method:'POST',body:JSON.stringify({totalKg,
        quantityConfirmed,quantitySourceHash:availability.quantitySourceHash,expectedConfirmedKg:availability.confirmedQuantityKg??null})});
      setAvailability(previous=>({...previous,...response.data}));
      setTotalKg(response.data.confirmedQuantityKg);setQuantityConfirmed(false);setQuantityEditing(false);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const submit = async () => {
    setBusy(true);setError('');
    try {
      const response = await apiRequest(`${base}/selection`,{method:'POST',body:JSON.stringify({
        supplierId:supplier.id,articleIndex:article.articleIndex,supplierConfirmed,articleConfirmed:true,acknowledgeUnverifiedMfi,
      })});
      addPurchaseCartItems([response.data.position],returnTo,response.data.header);
      navigate('/purchase-cart',{state:{returnTo}});
    } catch(e){setError(e.message);} finally{setBusy(false);}
  };
  const unavailable = availability.remainingKg == null || availability.remainingKg<=0 || quantityEditing;
  const enteringQuantity=availability.remainingKg===null || quantityEditing;
  return <Dialog open onClose={busy?undefined:onClose} fullWidth maxWidth="sm">
    <DialogTitle>Bestellung (Option)</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.5,pt:'8px !important'}}>
      <Typography>{position.articleName} · {offer.supplierName}</Typography>
      {availability.remainingKg!=null && <Typography variant="body2">Noch verfügbar: {Number(availability.remainingKg).toLocaleString('de-DE')} kg. Gespeicherte Bestellungen und Entwürfe sind berücksichtigt.</Typography>}
      {availability.remainingKg===null && <Alert severity="warning">Die Option nennt keine eindeutige Gesamtmenge in kg. Bitte die angebotene Gesamtmenge unten eingeben und bestätigen.</Alert>}
      {enteringQuantity && <Box sx={{display:'grid',gap:1}}>
        {(availability.quantityText || position.quantityText) && <Typography variant="body2">Mengenangabe der Option: {availability.quantityText || position.quantityText}</Typography>}
        {availability.maxTruckLoadKg!=null && <Typography variant="caption" color="text.secondary">Maximales Ladegewicht je LKW: {Number(availability.maxTruckLoadKg).toLocaleString('de-DE')} kg. Dies ist keine bestätigte Angebotsmenge.</Typography>}
        <TextField label="Angebotene Gesamtmenge (kg)" required type="number" size="small" value={totalKg} disabled={busy}
          helperText="Gesamtmenge dieser Optionsposition, nicht nur die Menge deiner Teilbestellung."
          inputProps={{min:0.001,step:0.001}} onChange={e=>{setTotalKg(e.target.value);setQuantityConfirmed(false);}} />
        <FormControlLabel control={<Checkbox checked={quantityConfirmed} disabled={busy||!(Number(totalKg)>0)} onChange={e=>setQuantityConfirmed(e.target.checked)} />}
          label="Ich habe die angebotene Gesamtmenge geprüft und bestätige die kg-Angabe." />
        <Box sx={{display:'flex',gap:1,flexWrap:'wrap'}}><Button variant="outlined" disabled={busy||!quantityConfirmed||!(Number(totalKg)>0)} onClick={confirmQuantity}>Gesamtmenge bestätigen</Button>
          {quantityEditing && <Button disabled={busy} onClick={()=>{setQuantityEditing(false);setQuantityConfirmed(false);setTotalKg(availability.confirmedQuantityKg??'');}}>Änderung verwerfen</Button>}</Box>
      </Box>}
      {!enteringQuantity && availability.confirmedQuantityKg!=null && availability.quantityConfirmationEditable!==false && <Box><Typography variant="body2">Bestätigte angebotene Gesamtmenge: {Number(availability.confirmedQuantityKg).toLocaleString('de-DE')} kg</Typography><Button size="small" disabled={busy} onClick={()=>setQuantityEditing(true)}>Gesamtmenge korrigieren</Button></Box>}
      {availability.remainingKg===0 && <Alert severity="warning">Diese Optionsposition ist bereits vollständig verplant.</Alert>}
      <Autocomplete options={suppliers} value={supplier} disabled={busy}
        isOptionEqualToValue={(a,b)=>a.id===b.id}
        getOptionLabel={row=>`${row.name} (${row.id})${row.city?` · ${row.city}`:''}`}
        onChange={(_e,value)=>{setSupplier(value);setSupplierConfirmed(false);setArticle(null);setArticles([]);setAcknowledgeUnverifiedMfi(false);}}
        renderInput={params=><TextField {...params} label="Lieferant" required size="small" />} />
      {supplier?.reason && <Typography variant="caption">{supplier.reason}</Typography>}
      <Box sx={{display:'flex',gap:1}}><TextField size="small" fullWidth label="Anderen Lieferanten suchen" value={supplierQuery} onChange={e=>setSupplierQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&supplierQuery.trim().length>=2)void loadSuppliers(supplierQuery.trim());}} /><Button disabled={busy||supplierQuery.trim().length<2} onClick={()=>loadSuppliers(supplierQuery.trim())}>Suchen</Button></Box>
      <FormControlLabel control={<Checkbox checked={supplierConfirmed} disabled={busy||!supplier} onChange={e=>{setSupplierConfirmed(e.target.checked);setArticle(null);setAcknowledgeUnverifiedMfi(false);}} />} label="Ich bestätige diesen Lieferanten für die Option." />
      {supplierConfirmed && <>
        <Autocomplete options={articles} value={article} disabled={busy} isOptionEqualToValue={(a,b)=>a.articleIndex===b.articleIndex}
          getOptionLabel={row=>`${row.articleName} (${row.articleIndex})`}
          getOptionDisabled={row=>Boolean(row.mfiCheck?.blocked)}
          noOptionsText="Kein Artikelvorschlag vorhanden. Bitte die Artikelsuche darunter verwenden."
          renderOption={(props,row)=><Box component="li" {...props} sx={{display:'block !important'}}><Typography variant="body2">{row.articleName} ({row.articleIndex})</Typography>{row.mfiCheck?.blocked && <Typography variant="caption" color="error">{row.mfiCheck.reasons?.join('; ') || 'MFI widerspricht der Option'}</Typography>}</Box>}
          onChange={(_e,value)=>{setArticle(value);setAcknowledgeUnverifiedMfi(false);}}
          renderInput={params=><TextField {...params} label="Artikel ausdrücklich auswählen" required size="small" />} />
        <Box sx={{display:'flex',gap:1}}><TextField size="small" fullWidth label="Artikel über Namen oder Nummer suchen" value={articleQuery} onChange={e=>setArticleQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&articleQuery.trim().length>=2)void loadArticles(articleQuery.trim());}} /><Button disabled={busy||articleQuery.trim().length<2} onClick={()=>loadArticles(articleQuery.trim())}>Suchen</Button></Box>
        {articles.length<articleTotal && <Button disabled={busy} onClick={()=>loadArticles(activeArticleQuery,articlePage+1)}>Weitere Artikel laden</Button>}
        {article?.reason && <Typography variant="caption">{article.reason}</Typography>}
        {article && !article.mfiCheck?.complete && <FormControlLabel control={<Checkbox checked={acknowledgeUnverifiedMfi} disabled={busy} onChange={e=>setAcknowledgeUnverifiedMfi(e.target.checked)} />} label="MFI-Eignung ist wegen fehlender Messwerte oder Prüfbedingungen ungeprüft. Ich bestätige die Auswahl trotzdem." />}
      </>}
      {busy && <CircularProgress size={22} />}
      {error && <Alert severity="error">{error}</Alert>}
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={onClose}>Abbrechen</Button><Button variant="contained" disabled={busy||unavailable||!supplierConfirmed||!article||article.mfiCheck?.blocked||(!article.mfiCheck?.complete&&!acknowledgeUnverifiedMfi)} onClick={submit}>In den Bestellwarenkorb</Button></DialogActions>
  </Dialog>;
}

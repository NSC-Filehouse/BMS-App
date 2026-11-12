import React from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,TextField} from '@mui/material';
import {apiRequest} from '../api/client.js';
import {buildLoadingLocationText,loadingLocationDraftErrors} from '../utils/loadingLocationDraft.js';

export default function LoadingLocationDialog({onClose,onConfirm}) {
  const [draft,setDraft]=React.useState({name:'',street:'',postalCode:'',city:'',countryId:'',pickupTimes:'',contact:'',notes:''});
  const [countries,setCountries]=React.useState([]);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [attempted,setAttempted]=React.useState(false);
  React.useEffect(()=>{
    const controller=new AbortController();let active=true;
    apiRequest('/delivery-address-country-types',{signal:controller.signal})
      .then(response=>{if(active){setCountries(response.data || []);if(!response.data?.length)setError('Die Länderauswahl konnte nicht geladen werden.');}})
      .catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[]);
  const errors=loadingLocationDraftErrors(draft,countries);
  const change=field=>event=>setDraft(previous=>({...previous,[field]:event.target.value}));
  const confirm=()=>{setAttempted(true);if(!Object.values(errors).some(Boolean))onConfirm(buildLoadingLocationText(draft,countries));};
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>Neuer Ladeort</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.25,pt:'16px !important'}}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField autoFocus label="Firma / Lager" required fullWidth value={draft.name} onChange={change('name')} error={attempted&&errors.name} inputProps={{maxLength:100}} />
      <TextField label="Straße + Hausnummer" required fullWidth value={draft.street} onChange={change('street')} error={attempted&&errors.street} inputProps={{maxLength:50}} />
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(120px,0.7fr) minmax(0,1.3fr)'},gap:1}}>
        <TextField label="PLZ" required fullWidth value={draft.postalCode} onChange={change('postalCode')} error={attempted&&errors.postalCode} inputProps={{maxLength:10}} />
        <TextField label="Ort" required fullWidth value={draft.city} onChange={change('city')} error={attempted&&errors.city} inputProps={{maxLength:50}} />
      </Box>
      <TextField label="Land" required select fullWidth value={draft.countryId} onChange={change('countryId')} error={attempted&&errors.countryId} disabled={loading}>
        <MenuItem value="" disabled>Bitte wählen</MenuItem>{countries.map(country=><MenuItem key={country.id} value={country.id}>{country.isoAlpha2} — {country.name || country.nameEnglish}</MenuItem>)}
      </TextField>
      {loading && <CircularProgress size={18} />}
      <TextField label="Ladezeiten" multiline minRows={2} fullWidth value={draft.pickupTimes} onChange={change('pickupTimes')} inputProps={{maxLength:250}} />
      <TextField label="Ansprechpartner vor Ort" fullWidth value={draft.contact} onChange={change('contact')} inputProps={{maxLength:150}} />
      <TextField label="Zusätzliche Hinweise" multiline minRows={2} fullWidth value={draft.notes} onChange={change('notes')} inputProps={{maxLength:250}} />
      {attempted&&errors.tooLong && <Alert severity="error">Die vollständige Ladeadresse darf höchstens 1.000 Zeichen enthalten.</Alert>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Abbrechen</Button><Button variant="contained" onClick={confirm} disabled={loading||!countries.length}>Übernehmen</Button></DialogActions>
  </Dialog>;
}

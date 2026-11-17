import React from 'react';
import { useI18n } from '../utils/i18n.jsx';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,TextField} from '@mui/material';
import {apiRequest} from '../api/client.js';
import {buildLoadingLocationText,loadingLocationDraftErrors} from '../utils/loadingLocationDraft.js';

export default function LoadingLocationDialog({onClose,onConfirm}) {
  const { lang, t } = useI18n();
  const [draft,setDraft]=React.useState({name:'',street:'',postalCode:'',city:'',countryId:'',pickupTimes:'',contact:'',notes:''});
  const [countries,setCountries]=React.useState([]);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [attempted,setAttempted]=React.useState(false);
  React.useEffect(()=>{
    const controller=new AbortController();let active=true;
    apiRequest('/delivery-address-country-types',{signal:controller.signal})
      .then(response=>{if(active){setCountries(response.data || []);if(!response.data?.length)setError(t('delivery_address_country_load_error'));}})
      .catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[lang, t]);
  const errors=loadingLocationDraftErrors(draft,countries);
  const change=field=>event=>setDraft(previous=>({...previous,[field]:event.target.value}));
  const confirm=()=>{setAttempted(true);if(!Object.values(errors).some(Boolean))onConfirm(buildLoadingLocationText(draft,countries));};
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('purchase_new_loading_location')}</DialogTitle>
    <DialogContent sx={{display:'grid',gap:1.25,pt:'16px !important'}}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField autoFocus label={t('purchase_location_company')} required fullWidth value={draft.name} onChange={change('name')} error={attempted&&errors.name} inputProps={{maxLength:100}} />
      <TextField label={t('delivery_address_street')} required fullWidth value={draft.street} onChange={change('street')} error={attempted&&errors.street} inputProps={{maxLength:50}} />
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(120px,0.7fr) minmax(0,1.3fr)'},gap:1}}>
        <TextField label={t('delivery_address_postal_code')} required fullWidth value={draft.postalCode} onChange={change('postalCode')} error={attempted&&errors.postalCode} inputProps={{maxLength:10}} />
        <TextField label={t('delivery_address_city')} required fullWidth value={draft.city} onChange={change('city')} error={attempted&&errors.city} inputProps={{maxLength:50}} />
      </Box>
      <TextField label={t('delivery_address_country_code')} required select fullWidth value={draft.countryId} onChange={change('countryId')} error={attempted&&errors.countryId} disabled={loading}>
        <MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>{countries.map(country=><MenuItem key={country.id} value={country.id}>{country.isoAlpha2} — {(lang === 'en' ? country.nameEnglish : country.name) || country.name || country.nameEnglish}</MenuItem>)}
      </TextField>
      {loading && <CircularProgress size={18} />}
      <TextField label={t('purchase_location_times')} multiline minRows={2} fullWidth value={draft.pickupTimes} onChange={change('pickupTimes')} inputProps={{maxLength:250}} />
      <TextField label={t('purchase_location_contact')} fullWidth value={draft.contact} onChange={change('contact')} inputProps={{maxLength:150}} />
      <TextField label={t('purchase_location_notes')} multiline minRows={2} fullWidth value={draft.notes} onChange={change('notes')} inputProps={{maxLength:250}} />
      {attempted&&errors.tooLong && <Alert severity="error">{t('purchase_location_too_long')}</Alert>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>{t('purchase_cancel')}</Button><Button variant="contained" onClick={confirm} disabled={loading||!countries.length}>{t('purchase_apply')}</Button></DialogActions>
  </Dialog>;
}

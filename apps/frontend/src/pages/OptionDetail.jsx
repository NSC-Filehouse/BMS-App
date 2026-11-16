import React from 'react';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OptionPurchaseDialog from '../components/OptionPurchaseDialog.jsx';
import OptionSourceDocuments from '../components/OptionSourceDocuments.jsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { navigateToReturn, createReturnTo } from '../utils/navigation.js';
import { useOptionValidityRefresh } from '../utils/useOptionValidityRefresh.js';
import { optionDate, optionNumber, optionPrice, optionQuantity, optionPackagingLayout, optionPositionTitle, optionPositionPath, optionDeliveryTerm } from '../utils/optionDisplay.js';

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)', alignItems: 'start', columnGap: 1.5, py: 0.7, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography>
  </Box>;
}

export default function OptionDetail() {
  const { id, positionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const sourceQuery = React.useMemo(() => {
    const input = new URLSearchParams(location.search), result = new URLSearchParams();
    for (const key of ['vlMandantId', 'vlScope']) if (input.has(key)) result.set(key, input.get(key));
    return result.toString();
  }, [location.search]);
  const [offer, setOffer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [deleteConfirm,setDeleteConfirm]=React.useState(false);
  const endpoint=`/options/${encodeURIComponent(id)}${positionId?`/positions/${encodeURIComponent(positionId)}`:''}`;
  const [purchasePosition,setPurchasePosition] = React.useState(null);
  const validityRefresh = useOptionValidityRefresh();

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setOffer(null);
    setPurchasePosition(null);
    apiRequest(`${endpoint}?${sourceQuery}`)
      .then((response) => { if (!active)return;const data=response?.data || null;
        if(!positionId && data?.positions?.length){const hashId=location.hash.match(/^#position-(\d+)$/)?.[1];const selected=hashId?data.positions.find(p=>String(p.id)===hashId):data.positions[0];if(!selected)throw Error('Optionsposition nicht mehr verfügbar.');navigate(optionPositionPath(data.id,selected.id)+location.search,{replace:true,state:location.state});return;}
        setOffer(data); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, t, sourceQuery,validityRefresh]);

  React.useEffect(() => {
    if (!offer || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [offer?.id, location.hash]);
  React.useEffect(() => {
    if (!offer?.positions?.some(position => ['pending', 'updating'].includes(position.matchProcessingStatus)
      || position.learningPending && position.matchProcessingStatus !== 'stale')) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      apiRequest(`${endpoint}?${sourceQuery}`)
        .then(response => { if (active && response?.data) setOffer(response.data); })
        .catch(() => { if (active) setError(t('loading_error')); });
    }, 5000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [offer, endpoint, sourceQuery, t]);

  async function deleteOption() {
    setDeleting(true); setError('');
    try {
      await apiRequest(endpoint, { method: 'DELETE',body:JSON.stringify({confirmed:true}) });
      navigateToReturn(navigate, location.state?.returnTo, '/options');
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setDeleting(false); }
  }

  const packaging=offer?optionPackagingLayout(offer,lang):{common:'',positions:{}};

  return <Box sx={{ width: '100%', maxWidth: 900, minWidth: 0, mx: 'auto' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <DisclosureBackButton onClick={() => navigateToReturn(navigate, location.state?.returnTo, '/options')} aria-label={t('back_label')}><ArrowBackIcon /></DisclosureBackButton>
      <Typography variant="h5">{t('option_detail_title')}</Typography>
      {offer && <Button color="error" disabled={deleting} onClick={()=>setDeleteConfirm(true)} sx={{ ml: 'auto' }}>{t('option_delete')}</Button>}
    </Box>
    {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !error && offer && <Card sx={{ mb: 1.5 }}><CardContent>
        <InfoRow label={t('option_from')} value={offer.supplierName} />
        <OptionSourceDocuments key={offer.id} offer={offer} />
        {offer.isDemo && <Alert severity="warning" sx={{ mb: 1 }}>{t('option_demo_notice')}</Alert>}
        <InfoRow label={t('option_valid_until')} value={optionDate(offer.validUntil)} />
        {offer.isDemo && <InfoRow label={t('option_source_valid_until')} value={optionDate(offer.sourceValidUntil)} />}
        <InfoRow label={t('option_delivery_term')} value={optionDeliveryTerm(offer.incoterm, offer.loadingLocation)} />
        <InfoRow label={t('option_packaging')} value={packaging.common || 'Verpackungsart klären'} />
      {offer.positions?.map((position) => <Box id={`position-${position.id}`} key={position.id} sx={{ pt: 1.5, mt: 1.5, borderTop:'1px solid',borderColor:'divider',scrollMarginTop: 80 }}>
        {position.expired && <Alert severity="warning" sx={{ mb: 1 }}>{lang === 'en' ? 'Expired – for information only' : 'Abgelaufen – nur zur Information'}</Alert>}
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{optionPositionTitle(position)}</Typography>
        {position.singleCandidateName && <Typography variant="caption" color="text.secondary">{position.singleCandidateName}</Typography>}
        <Typography variant="h6" sx={{ my: 1 }}>{optionPrice(position, t)}</Typography>
        <Button variant="contained" onClick={()=>setPurchasePosition(position)} disabled={position.remainingKg===0} sx={{mb:1}}>Bestellen</Button>
        <InfoRow label={t('option_quantity')} value={position.confirmedQuantityKg!=null?`${optionNumber(position.confirmedQuantityKg)} kg`:optionQuantity(position, t)} />
        {position.orderedKg>0 && <InfoRow label="Noch verfügbar" value={`${optionNumber(position.remainingKg)} kg`} />}
        <InfoRow label={t('option_packaging')} value={packaging.positions[position.id]} />
        <InfoRow label={t('option_batch')} value={position.batchNo} />
        <InfoRow label={t('option_mfi')} value={position.mfi==null?null:`${optionNumber(position.mfi)}${position.mfiTo!=null && position.mfiTo!==position.mfi?`–${optionNumber(position.mfiTo)}`:''}`} />
        <InfoRow label={lang==='en'?'Test method':'Messmethode'} value={position.mfiTestCondition} />
        <InfoRow label={t('option_properties')} value={position.propertiesText} />
        {(position.assignmentMfiCheck?.blocked || position.assignmentMaterialCheck?.blocked) && <Alert severity="warning">Die bisherige Artikelzuordnung muss geprüft werden. Bitte beim Bestellen einen passenden Artikel wählen.</Alert>}
        {position.validUntil !== offer.validUntil && <InfoRow label={t('option_valid_until')} value={optionDate(position.validUntil)} />}
      </Box>)}
    </CardContent></Card>}
    <Dialog open={deleteConfirm} onClose={deleting?undefined:()=>setDeleteConfirm(false)}><DialogTitle>Option wirklich löschen?</DialogTitle><DialogContent>{offer?.positions?.[0] && optionPositionTitle(offer.positions[0])}<Typography variant="body2" sx={{mt:1}}>Es wird nur diese Optionsposition entfernt.</Typography></DialogContent><DialogActions><Button autoFocus disabled={deleting} onClick={()=>setDeleteConfirm(false)}>Abbrechen</Button><Button color="error" disabled={deleting} onClick={deleteOption}>Option löschen</Button></DialogActions></Dialog>
    {offer && purchasePosition && !error && <OptionPurchaseDialog key={purchasePosition.id} offer={offer} position={purchasePosition}
      preferredSupplierId={location.state?.optionSupplierId} returnTo={createReturnTo(location)} onClose={()=>setPurchasePosition(null)} />}
  </Box>;
}

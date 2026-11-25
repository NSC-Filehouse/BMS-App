import React from 'react';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import PhoneIcon from '@mui/icons-material/Phone';
import OptionOfferCustomers from '../components/OptionOfferCustomers.jsx';
import OptionPurchaseControls from '../components/OptionPurchaseControls.jsx';
import { useFeatureAccess } from '../components/FeatureAccess.jsx';
import OptionSourceDocuments from '../components/OptionSourceDocuments.jsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { navigateToReturn, createReturnTo } from '../utils/navigation.js';
import { useOptionValidityRefresh } from '../utils/useOptionValidityRefresh.js';
import { getMandant } from '../utils/mandant.js';
import { createPurchaseLineId } from '../utils/purchaseCart.js';
import { optionDate, optionNumber, optionPrice, optionQuantity, optionMfi, optionPackagingLayout, optionPositionTitle, optionPositionPath, optionDeliveryTerm } from '../utils/optionDisplay.js';

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)', alignItems: 'start', columnGap: 1.5, py: 0.7, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="div" variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography>
  </Box>;
}

export default function OptionDetail() {
  const { id, positionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const { features } = useFeatureAccess();
  const sourceQuery = React.useMemo(() => {
    const input = new URLSearchParams(location.search), result = new URLSearchParams();
    for (const key of ['vlMandantId', 'vlScope']) if (input.has(key)) result.set(key, input.get(key));
    return result.toString();
  }, [location.search]);
  const [offer, setOffer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [checkingStock, setCheckingStock] = React.useState(false);
  const [orderStartError, setOrderStartError] = React.useState('');
  const stockRequest = React.useRef(null);
  const [deleteConfirm,setDeleteConfirm]=React.useState(false);
  const endpoint=`/options/${encodeURIComponent(id)}${positionId?`/positions/${encodeURIComponent(positionId)}`:''}`;
  const validityRefresh = useOptionValidityRefresh();
  const mandant = getMandant();
  React.useEffect(() => {
    setCheckingStock(false);
    setOrderStartError('');
    return () => {
      stockRequest.current?.abort();
      stockRequest.current = null;
    };
  }, [id, positionId, mandant]);
  const position = offer?.positions?.[0];
  const audienceKey = positionId && position && offer.id === Number(id) && position.id === Number(positionId)
    ? JSON.stringify([mandant, endpoint, position.snapshotId, position.matchProcessingStatus,
      position.articleIndex, position.suggestedArticleIndex, validityRefresh])
    : '';
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setOffer(null);
    apiRequest(`${endpoint}?${sourceQuery}`)
      .then((response) => { if (!active)return;const data=response?.data || null;
        if(!positionId && data?.positions?.length){const hashId=location.hash.match(/^#position-(\d+)$/)?.[1];const selected=hashId?data.positions.find(p=>String(p.id)===hashId):data.positions[0];if(!selected)throw Error('Optionsposition nicht mehr verfügbar.');navigate(optionPositionPath(data.id,selected.id)+location.search,{replace:true,state:location.state});return;}
        setOffer(data); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint, t, sourceQuery,validityRefresh,mandant]);

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

  async function startOrder(article, supplier) {
    stockRequest.current?.abort();
    const controller = new AbortController();
    stockRequest.current = controller;
    setCheckingStock(true);
    setOrderStartError('');
    const returnTo = createReturnTo(location);
    const procurementOption = {
      optionId: offer.id, optionPositionId: position.id, articleIndex: article.articleIndex,
      article: article.articleName, amountInKg: '', price: '', costPrice: position.pricePerTonne ?? null,
      optionSupplier: supplier,
    };
    try {
      const { data } = await apiRequest('/temp-orders/procurement/stock?' + new URLSearchParams({
        articleIndex: article.articleIndex, checkPurchaseLink: '1',
      }),
        { signal: controller.signal });
      if (controller.signal.aborted) return;
      if ((data || []).some((lot) => Number(lot.available) > 0)) {
        navigate('/temp-orders/new', { state: { returnTo, procurementOption } });
      } else {
        navigate(`/options/${offer.id}/positions/${position.id}/order-purchase`, {
          state: { returnTo, procurementOption, clientRequestId: createPurchaseLineId(), mandant,
            supplierArticleName: position.articleName,
            incoterm: offer.incoterm, loadingLocation: position.loadingLocation || offer.loadingLocation },
        });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setOrderStartError(cause.message || t('loading_error'));
    } finally {
      if (stockRequest.current === controller) {
        stockRequest.current = null;
        setCheckingStock(false);
      }
    }
  }

  return <Box sx={{ width: '100%', maxWidth: 900, minWidth: 0, mx: 'auto' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <DisclosureBackButton onClick={() => navigateToReturn(navigate, location.state?.returnTo, '/options')} aria-label={t('back_label')}><ArrowBackIcon /></DisclosureBackButton>
      <Typography variant="h5">{t('option_detail_title')}</Typography>
      {offer && <Button color="error" disabled={deleting} onClick={()=>setDeleteConfirm(true)} sx={{ ml: 'auto' }}>{t('option_delete')}</Button>}
    </Box>
    {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {orderStartError && <Alert severity="error">{orderStartError}</Alert>}
    {!loading && !error && offer && position && <OptionPurchaseControls
      key={JSON.stringify([mandant, offer.id, position.id, position.snapshotId, location.state?.optionSupplierId])}
      enabled={features.purchaseOrders} offer={offer} position={position} preferredSupplierId={location.state?.optionSupplierId}
      returnTo={createReturnTo(location)}
      onCustomerOrder={features.linkedProcurement ? startOrder : undefined} checkingStock={checkingStock}
      renderDetails={({ supplierField, purchaseControls, article, articlePending }) => <OptionPositionDetails
        offer={offer} position={position} supplierField={supplierField} purchaseControls={purchaseControls}
        audienceEndpoint={`${endpoint}/offer-customers`} audienceKey={audienceKey}
        articleIndex={articlePending ? undefined : article?.articleIndex}
      />} />}
    <Dialog open={deleteConfirm} onClose={deleting?undefined:()=>setDeleteConfirm(false)}><DialogTitle>Option wirklich löschen?</DialogTitle><DialogContent>{offer?.positions?.[0] && optionPositionTitle(offer.positions[0])}<Typography variant="body2" sx={{mt:1}}>Es wird nur diese Optionsposition entfernt.</Typography></DialogContent><DialogActions><Button autoFocus disabled={deleting} onClick={()=>setDeleteConfirm(false)}>Abbrechen</Button><Button color="error" disabled={deleting} onClick={deleteOption}>Option löschen</Button></DialogActions></Dialog>
  </Box>;
}

export function OptionPositionDetails({ offer, position, supplierField, purchaseControls, audienceEndpoint, audienceKey, articleIndex }) {
  const { t, lang } = useI18n();
  const location = useLocation();
  const query = articleIndex ? `?${new URLSearchParams({ articleIndex })}` : '';
  const requestKey = audienceKey ? JSON.stringify([audienceKey, query]) : '';
  const [audienceResult, setAudienceResult] = React.useState(null);
  const [audienceRevision, setAudienceRevision] = React.useState(0);
  const audience = audienceResult?.key === requestKey ? audienceResult : null;
  const matchedArticle = audience?.matched === false ? null : audience?.article;
  const recordedOffers = requestKey && audienceResult?.scope === audienceKey
    ? (audienceResult.customers ?? []).filter(customer => customer.offerStatus || customer.queued || customer.sent || customer.failed)
    : [];

  React.useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();
    apiRequest(`${audienceEndpoint}${query}`, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setAudienceResult({ key: requestKey, scope: audienceKey, ...response.data });
      })
      .catch(cause => {
        if (!controller.signal.aborted) setAudienceResult({ key: requestKey, error: cause.message || t('loading_error') });
      });
    return () => controller.abort();
  }, [requestKey, audienceKey, audienceEndpoint, query, audienceRevision, t]);

  React.useEffect(() => {
    if (!audience?.customers?.some(customer => customer.queued)) return undefined;
    const timer = window.setTimeout(() => setAudienceRevision(value => value + 1), 15000);
    return () => window.clearTimeout(timer);
  }, [audience]);

  function offersQueued(ids) {
    const queued = new Set(ids);
    setAudienceResult(previous => previous?.key === requestKey && previous.customers ? {
      ...previous, customers: previous.customers.map(customer => queued.has(customer.id)
        ? { ...customer, queued: true, failed: false } : customer),
    } : previous);
    setAudienceRevision(value => value + 1);
  }

  const packaging = optionPackagingLayout(offer, lang);

  return <>
    <Card sx={{ mb: 1.5 }}><CardContent>
        <InfoRow label={t('option_from')} value={<>
          <Box component="span" sx={{display:'inline-flex',alignItems:'center',maxWidth:'100%'}}><Box component="span" sx={{minWidth:0}}>{offer.supplierName}</Box><OptionSourceDocuments key={offer.id} offer={offer} /></Box>
          {offer.contact?.name && <Box sx={{display:'flex',alignItems:'center',gap:0.5}}>
            <span>{offer.contact.name}</span>
            {offer.contact.phone && <Tooltip title={offer.contact.phone}><IconButton component="a" href={`tel:${offer.contact.phone.replace(/[^+\d*#]/g,'')}`} size="small" color="primary" aria-label={`${t('phone_label')}: ${offer.contact.name}`}><PhoneIcon fontSize="small" /></IconButton></Tooltip>}
          </Box>}
        </>} />
        {supplierField}
        {offer.isDemo && <Alert severity="warning" sx={{ mb: 1 }}>{t('option_demo_notice')}</Alert>}
        <InfoRow label={t('option_valid_until')} value={optionDate(offer.validUntil)} />
        {offer.isDemo && <InfoRow label={t('option_source_valid_until')} value={optionDate(offer.sourceValidUntil)} />}
      <Box id={`position-${position.id}`} sx={{ pt: 1, scrollMarginTop: 80 }}>
        {position.expired && <Alert severity="warning" sx={{ mb: 1 }}>{lang === 'en' ? 'Expired – for information only' : 'Abgelaufen – nur zur Information'}</Alert>}
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
          {optionPositionTitle(position)}
          {matchedArticle && <CheckIcon
            color="success" fontSize="small" titleAccess={t('option_article_found')}
            sx={{ verticalAlign: 'text-bottom', ml: 0.75 }}
          />}
        </Typography>
        {(matchedArticle?.name || position.singleCandidateName) && <Typography variant="caption" color="text.secondary">
          {matchedArticle?.name || position.singleCandidateName}
        </Typography>}
        <Typography variant="h6" sx={{ my: 1 }}>{optionPrice(position, t)}</Typography>
        <InfoRow label={t('option_delivery_term')} value={position.deliveryTermDisplay ?? optionDeliveryTerm(offer.incoterm, offer.loadingLocation)} />
        <InfoRow label={t('option_packaging')} value={packaging.positions[position.id] || packaging.common || (lang==='en'?'Unresolved':'ungeklärt')} />
        <InfoRow label={t('option_quantity')} value={position.confirmedQuantityKg!=null && !position.truckMax && !position.truckMin?`${optionNumber(position.confirmedQuantityKg)} kg`:optionQuantity(position, t)} />
        {position.orderedKg>0 && <InfoRow label="Noch verfügbar" value={`${optionNumber(position.remainingKg)} kg`} />}
        <InfoRow label={t('option_mfi')} value={optionMfi(position)} />
        <InfoRow label={t('option_batch')} value={position.batchNo} />
        <InfoRow label={t('option_properties')} value={position.propertiesText} />
        {position.validUntil !== offer.validUntil && <InfoRow label={t('option_valid_until')} value={optionDate(position.validUntil)} />}
        {purchaseControls}
      </Box>
    </CardContent></Card>
    {requestKey && (audience?.article || !audience || audience.error) && (
      <OptionOfferCustomers key={JSON.stringify([requestKey, audience?.article?.index])}
        customers={(audience?.customers ?? []).filter(customer => !customer.offerStatus && !customer.queued && !customer.sent
          && !(customer.failed && customer.readOnly))} salesFilter={audience?.salesFilter}
        position={position} loadingLocation={offer.loadingLocation}
        loading={!audience} error={audience?.error} endpoint={audienceEndpoint} query={query}
        sendEnabled={audience?.sendEnabled} onQueued={offersQueued}
      />
    )}
    {recordedOffers.length > 0 && <OptionOfferCustomers historyOnly customers={recordedOffers} returnTo={createReturnTo(location)} />}
  </>;
}

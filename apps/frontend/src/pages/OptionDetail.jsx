import React from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArticleAssignment from '../components/OptionArticleAssignment.jsx';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { navigateToReturn } from '../utils/navigation.js';
import { optionDate, optionNumber, optionPrice, optionQuantity } from '../utils/optionDisplay.js';

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <Box sx={{ display: { xs: 'grid', md: 'flex' }, justifyContent: 'space-between', gap: 0.5, py: 0.7, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ textAlign: { md: 'right' }, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography>
  </Box>;
}

export default function OptionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const sourceQuery = React.useMemo(() => {
    const input = new URLSearchParams(location.search), result = new URLSearchParams();
    for (const key of ['preview', 'vlMandantId', 'vlScope']) if (input.has(key)) result.set(key, input.get(key));
    return result.toString();
  }, [location.search]);
  const [offer, setOffer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setOffer(null);
    apiRequest(`/options/${encodeURIComponent(id)}?${sourceQuery}`)
      .then((response) => { if (active) setOffer(response?.data || null); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, t, revision, sourceQuery]);

  React.useEffect(() => {
    if (!offer || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, [offer, location.hash]);

  async function deleteOption() {
    if (!window.confirm(t('option_delete_confirm'))) return;
    setDeleting(true); setError('');
    try {
      await apiRequest(`/options/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigateToReturn(navigate, location.state?.returnTo, '/options');
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setDeleting(false); }
  }

  return <Box sx={{ width: '100%', maxWidth: 900, minWidth: 0, mx: 'auto' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <IconButton onClick={() => navigateToReturn(navigate, location.state?.returnTo, '/options')} aria-label={t('back_label')}><ArrowBackIcon /></IconButton>
      <Typography variant="h5">{t('option_detail_title')}</Typography>
      {offer && !offer.readOnly && <Button color="error" disabled={deleting} onClick={deleteOption} sx={{ ml: 'auto' }}>{t('option_delete')}</Button>}
    </Box>
    {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !error && offer && <>
      <Card sx={{ mb: 1.5 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>{offer.supplierName}</Typography>
        {offer.isDemo && <Alert severity="warning" sx={{ mb: 1 }}>{t('option_demo_notice')}</Alert>}
        <InfoRow label={t('option_valid_until')} value={optionDate(offer.validUntil)} />
        {offer.isDemo && <InfoRow label={t('option_source_valid_until')} value={optionDate(offer.sourceValidUntil)} />}
        <InfoRow label={t('option_delivery_term')} value={[offer.incoterm, offer.loadingLocation].filter(Boolean).join(' ')} />
        <InfoRow label={t('option_packaging')} value={offer.packagingText} />
        <InfoRow label={t('option_loading')} value={offer.termsText} />
        <InfoRow label={t('option_comment')} value={offer.comment} />
        <InfoRow label={t('option_negotiable')} value={offer.negotiable === 'yes' ? t('option_yes') : offer.negotiable === 'no' ? t('option_no') : t('option_unconfirmed')} />
        <InfoRow label={t('option_negotiable_evidence')} value={offer.negotiableEvidence} />
      </CardContent></Card>
      {offer.positions?.map((position) => <Card id={`position-${position.id}`} key={position.id} sx={{ mb: 1.5, scrollMarginTop: 80 }}><CardContent>
        {position.expired && <Alert severity="warning" sx={{ mb: 1 }}>{lang === 'en' ? 'Expired – for information only' : 'Abgelaufen – nur zur Information'}</Alert>}
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{position.internalArticleName || position.articleName}</Typography>
        {position.internalArticleName && position.internalArticleName !== position.articleName &&
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{position.articleName}</Typography>}
        <Typography variant="h6" sx={{ my: 1 }}>{optionPrice(position, t)}</Typography>
        {position.priceNeedsReview && <Alert severity="warning" sx={{ mb: 1 }}>{t('option_price_review_explanation')}</Alert>}
        {position.priceNeedsReview && <InfoRow label={t('option_raw_price_basis')}
          value={`${optionNumber(position.price, 2)} ${position.priceUnit || position.currency || ''}`} />}
        <Divider sx={{ my: 1 }} />
        <InfoRow label={t('option_quantity')} value={optionQuantity(position, t)} />
        {position.quantityMinKg !== null && <InfoRow label={t('option_raw_quantity')} value={position.quantityText || `${position.quantityMin} ${position.quantityUnit || ''}`} />}
        <InfoRow label={t('option_category')} value={position.materialCategory} />
        <InfoRow label={t('option_quality')} value={position.quality} />
        <InfoRow label={t('option_batch')} value={position.batchNo} />
        <InfoRow label={t('option_mfi')} value={position.mfi === null ? '' : `${optionNumber(position.mfi)}${position.mfiTestCondition ? ` (${position.mfiTestCondition})` : ''}`} />
        <InfoRow label={t('option_density')} value={[optionNumber(position.density), position.densityUnit].filter(Boolean).join(' ')} />
        <InfoRow label={t('option_c2')} value={optionNumber(position.c2)} />
        <InfoRow label={t('option_properties')} value={position.propertiesText} />
        <InfoRow label={t('option_loading')} value={position.loadingText} />
        <InfoRow label={t('option_comment')} value={position.comment} />
        <ArticleAssignment optionId={offer.id} position={position} onAssigned={() => setRevision((value) => value + 1)} sourceQuery={sourceQuery} readOnly={offer.readOnly} />
        {position.validUntil !== offer.validUntil && <InfoRow label={t('option_valid_until')} value={optionDate(position.validUntil)} />}
      </CardContent></Card>)}
    </>}
  </Box>;
}

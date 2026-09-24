import React from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, Divider, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
  const { t } = useI18n();
  const [offer, setOffer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest(`/options/${encodeURIComponent(id)}`)
      .then((response) => { if (active) setOffer(response?.data || null); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, t]);

  return <Box sx={{ width: '100%', maxWidth: 900, minWidth: 0, mx: 'auto' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <IconButton onClick={() => navigateToReturn(navigate, location.state?.returnTo, '/options')} aria-label={t('back_label')}><ArrowBackIcon /></IconButton>
      <Typography variant="h5">{t('option_detail_title')}</Typography>
    </Box>
    {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {!loading && !error && offer && <>
      <Card sx={{ mb: 1.5 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>{offer.supplierName}</Typography>
        {offer.isDemo && <Alert severity="warning" sx={{ mb: 1 }}>{t('option_demo_notice')}</Alert>}
        <InfoRow label={t('option_valid_until')} value={optionDate(offer.validUntil)} />
        <InfoRow label={t('option_delivery_term')} value={[offer.incoterm, offer.loadingLocation].filter(Boolean).join(' ')} />
        <InfoRow label={t('option_packaging')} value={offer.packagingText} />
        <InfoRow label={t('option_loading')} value={offer.termsText} />
      </CardContent></Card>
      {offer.positions?.map((position) => <Card key={position.id} sx={{ mb: 1.5 }}><CardContent>
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{position.internalArticleName || position.articleName}</Typography>
        {position.internalArticleName && position.internalArticleName !== position.articleName &&
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{position.articleName}</Typography>}
        <Typography variant="h6" sx={{ my: 1 }}>{optionPrice(position, t)}</Typography>
        <Divider sx={{ my: 1 }} />
        <InfoRow label={t('option_quantity')} value={optionQuantity(position, t)} />
        <InfoRow label={t('option_category')} value={position.materialCategory} />
        <InfoRow label={t('option_quality')} value={position.quality} />
        <InfoRow label={t('option_batch')} value={position.batchNo} />
        <InfoRow label={t('option_mfi')} value={position.mfi === null ? '' : `${optionNumber(position.mfi)}${position.mfiTestCondition ? ` (${position.mfiTestCondition})` : ''}`} />
        <InfoRow label={t('option_density')} value={optionNumber(position.density)} />
        <InfoRow label={t('option_c2')} value={optionNumber(position.c2)} />
        <InfoRow label={t('option_properties')} value={position.propertiesText} />
        <InfoRow label={t('option_loading')} value={position.loadingText} />
        {position.validUntil !== offer.validUntil && <InfoRow label={t('option_valid_until')} value={optionDate(position.validUntil)} />}
      </CardContent></Card>)}
    </>}
  </Box>;
}

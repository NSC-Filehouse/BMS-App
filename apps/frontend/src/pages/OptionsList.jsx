import React from 'react';
import { Alert, Box, CircularProgress, FormControlLabel, InputAdornment, Radio, RadioGroup, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';
import { optionDate, optionPrice, optionQuantity, optionPositionTitle, optionCategory, optionPositionPath, optionPackaging, optionDeliveryTerm } from '../utils/optionDisplay.js';
import { useOptionValidityRefresh } from '../utils/useOptionValidityRefresh.js';

export default function OptionsList() {
  const [offers, setOffers] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [listView, setListView] = React.useState('grouped');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const validityRefresh=useOptionValidityRefresh();

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setOffers([]);setError('');
    apiRequest('/options')
      .then((response) => { if (active) setOffers(Array.isArray(response?.data) ? response.data : []); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t,validityRefresh]);

  const groups = React.useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const grouped = new Map();
    offers.forEach((offer) => {
      offer.positions?.forEach((position) => {
        const haystack = [offer.supplierName, position.articleName, position.internalArticleName,
          position.materialCategory, position.quality, position.batchNo, offer.loadingLocation]
          .filter(Boolean).join(' ').toLocaleLowerCase();
        if (search && !haystack.includes(search)) return;
        const key = listView === 'received' ? (offer.receivedDate || '') : (optionCategory(position) || t('option_other_category'));
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({ offer, position });
      });
    });
    return [...grouped.entries()].sort(([a], [b]) =>
      listView === 'received' ? b.localeCompare(a) : a.localeCompare(b, 'de'));
  }, [offers, query, listView, t]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', minWidth: 0 }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>{t('options_title')}</Typography>
      <TextField
        fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={t('options_search')} sx={{ mb: 0.25 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
      />
      <RadioGroup className="filter-radio-group"
        row aria-label={t('options_list_view')} value={listView}
        onChange={(event) => setListView(event.target.value)}
        sx={{ mb: 0.5, columnGap: 1.5, '& .MuiFormControlLabel-root': { m: 0 },
          '& .MuiRadio-root': { p: 0.5 } }}
      >
        <FormControlLabel value="grouped" control={<Radio size="small" />} label={t('options_list_grouped')} />
        <FormControlLabel value="received" control={<Radio size="small" />} label={t('options_list_received')} />
      </RadioGroup>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>}
      {!loading && !error && groups.length === 0 && <Typography color="text.secondary">{t('options_empty')}</Typography>}
      <Box sx={{ overflowY: 'auto', minHeight: 0, display: 'grid', alignContent: 'start', gap: 0.4 }}>
        {groups.map(([key, entries]) => (
          <Box key={key} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.35, fontWeight: 700 }}>
              {listView === 'received' ? (optionDate(key) || t('options_list_received_unknown')) : key}
            </Typography>
            {entries.map(({ offer, position }) => (
              <Box
                key={`${offer.id}-${position.id}`}
                role="button" tabIndex={0}
                onClick={() => navigate(optionPositionPath(offer.id,position.id), { state: { returnTo: createReturnTo(location) } })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(optionPositionPath(offer.id,position.id), { state: { returnTo: createReturnTo(location) } });
                  }
                }}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.8, mb: 0.4,
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  bgcolor: 'background.paper', cursor: 'pointer', minWidth: 0,
                  '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{optionPositionTitle(position)}</Box>
                    {offer.isDemo && <Box component="span" sx={{ color: 'warning.dark', fontWeight: 600 }}> · {t('option_demo')}</Box>}
                  </Typography>
                  {position.singleCandidateName && <Typography variant="caption" sx={{display:'block',color:'text.secondary'}}>{position.singleCandidateName}</Typography>}
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{t('option_from')}: {offer.supplierName}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {[optionQuantity(position, t), optionPrice(position, t), optionPackaging(position, lang),
                      position.mfiTestCondition?`${lang==='en'?'Test method':'Messmethode'}: ${position.mfiTestCondition}`:null,
                      optionDeliveryTerm(offer.incoterm, offer.loadingLocation),
                      `${t('option_valid_until')} ${optionDate(position.validUntil || offer.validUntil)}`]
                      .filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <ChevronRightIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

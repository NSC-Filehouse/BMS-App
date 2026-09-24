import React from 'react';
import { Alert, Box, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';
import { optionDate, optionNumber, optionPrice, optionQuantity } from '../utils/optionDisplay.js';

export default function OptionsList() {
  const [offers, setOffers] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest('/options')
      .then((response) => { if (active) setOffers(Array.isArray(response?.data) ? response.data : []); })
      .catch((cause) => { if (active) setError(cause?.message || t('loading_error')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t]);

  const groups = React.useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const grouped = new Map();
    offers.forEach((offer) => {
      offer.positions?.forEach((position) => {
        const haystack = [offer.supplierName, position.articleName, position.internalArticleName,
          position.materialCategory, position.quality, position.batchNo, offer.loadingLocation]
          .filter(Boolean).join(' ').toLocaleLowerCase();
        if (search && !haystack.includes(search)) return;
        const category = position.materialCategory || t('option_other_category');
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push({ offer, position });
      });
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [offers, query, t]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', minWidth: 0 }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>{t('options_title')}</Typography>
      <TextField
        fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={t('options_search')} sx={{ mb: 1.25 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
      />
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>}
      {!loading && !error && groups.length === 0 && <Typography color="text.secondary">{t('options_empty')}</Typography>}
      <Box sx={{ overflowY: 'auto', minHeight: 0, display: 'grid', alignContent: 'start', gap: 0.4 }}>
        {groups.map(([category, entries]) => (
          <Box key={category} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.35, fontWeight: 700 }}>{category}</Typography>
            {entries.map(({ offer, position }) => (
              <Box
                key={`${offer.id}-${position.id}`}
                role="button" tabIndex={0}
                onClick={() => navigate(`/options/${encodeURIComponent(offer.id)}`, { state: { returnTo: createReturnTo(location) } })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/options/${encodeURIComponent(offer.id)}`, { state: { returnTo: createReturnTo(location) } });
                  }
                }}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.8, mb: 0.4,
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  bgcolor: 'background.paper', cursor: 'pointer', minWidth: 0,
                  '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>{t('option_prefix')} </Box>
                    <Box component="span" sx={{ fontWeight: 600 }}>{position.internalArticleName || position.articleName}</Box>
                    {offer.isDemo && <Box component="span" sx={{ color: 'warning.dark', fontWeight: 600 }}> · {t('option_demo')}</Box>}
                    {position.internalArticleName && position.internalArticleName !== position.articleName && ` · ${position.articleName}`}
                    {position.mfi !== null && ` · MFI ${optionNumber(position.mfi)}`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                    {[optionQuantity(position, t), optionPrice(position, t), offer.supplierName,
                      offer.loadingLocation ? `${offer.incoterm || ''} ${offer.loadingLocation}`.trim() : offer.incoterm,
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

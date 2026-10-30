import React from 'react';
import { BackAwareAccordion as Accordion } from './DisclosureBack.jsx';
import { AccordionSummary, AccordionDetails, Alert, Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';
import { optionDate, optionPrice, optionQuantity, optionMfi } from '../utils/optionDisplay.js';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';

export default function SupplierOptions({ supplierId, mandant }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const saved = location.state?.supplierOptionsState;
  const initial = saved?.supplierId === supplierId && saved?.mandant === mandant ? saved : null;
  const [expanded, setExpanded] = React.useState(Boolean(initial?.expanded));
  const [offers, setOffers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState('');
  const [identified, setIdentified] = React.useState(true);
  const [attempt, setAttempt] = React.useState(0);
  const restored = React.useRef(false);
  React.useEffect(() => {
    if (!expanded || loaded) return undefined;
    let active = true;
    setLoading(true); setError('');
    apiRequest(`/customers/${encodeURIComponent(supplierId)}/options`)
      .then(response => {
        if (!active) return;
        setOffers(Array.isArray(response?.data) ? response.data : []);
        setIdentified(response?.meta?.supplierIdentified !== false);
        setLoaded(true); setLoading(false);
      })
      .catch(cause => { if (active) { setError(cause?.message || t('loading_error')); setLoading(false); } });
    return () => { active = false; };
  }, [expanded, loaded, supplierId, mandant, attempt, t]);
  React.useEffect(() => {
    if (!loaded || !initial || restored.current) return undefined;
    const frame = requestAnimationFrame(() => { window.scrollTo(0, initial.scrollTop || 0); restored.current = true; });
    return () => cancelAnimationFrame(frame);
  }, [loaded, initial]);
  const count = offers.reduce((sum, offer) => sum + (offer.positions?.length || 0), 0);
  function openOption(offer, position) {
    const returnTo = createReturnTo(location, { ...location.state, detailView: 'supplier',
      supplierOptionsState: { supplierId, mandant, expanded: true, scrollTop: window.scrollY } });
    navigate(`/options/${encodeURIComponent(offer.id)}#position-${position.id}`, { state: { returnTo } });
  }
  return <Accordion expanded={expanded} onChange={(_event, value) => setExpanded(value)}>
    <AccordionSummary expandIcon={<ExpandCollapseIndicator accordion />}>
      <Typography variant="subtitle1">{t('options_title')}{loaded ? ` (${count})` : ''}</Typography>
    </AccordionSummary>
    <AccordionDetails sx={{ display: 'grid', gap: 0.4, px: 1.25, py: 0.75 }}>
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setAttempt(value => value + 1)}>{t('supplier_options_retry')}</Button>}>{error}</Alert>}
      {loaded && !identified && <Typography variant="body2" color="text.secondary">{t('supplier_options_unidentified')}</Typography>}
      {loaded && identified && !count && <Typography variant="body2" color="text.secondary">{t('supplier_options_empty')}</Typography>}
      {loaded && offers.flatMap(offer => (offer.positions || []).map(position => <ButtonBase
        key={`${offer.id}-${position.id}`} onClick={() => openOption(offer, position)}
        sx={{ width: '100%', textAlign: 'left', justifyContent: 'space-between', gap: 1, p: 1,
          borderBottom: '1px solid', borderColor: 'divider', borderRadius: 0.5,
          '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {position.internalArticleName || position.articleName}
            {position.mfi != null && ` · MFI ${optionMfi(position)}`}
            {offer.isDemo && ` · ${t('option_demo')}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
            {[optionQuantity(position, t), optionPrice(position, t), `${t('option_valid_until')} ${optionDate(position.validUntil || offer.validUntil)}`].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <ChevronRightIcon color="action" sx={{ flexShrink: 0 }} />
      </ButtonBase>))}
    </AccordionDetails>
  </Accordion>;
}

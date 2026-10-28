import React from 'react';
import { Alert, Box, CircularProgress, TextField, Typography } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

export default function PickupAddressField({ positionSignature, contextKey, ready, value, onChange, onSuggest, onStatusChange }) {
  const { t } = useI18n();
  const [state, setState] = React.useState({ loading: false, addresses: [], unresolved: [], conflict: false, error: '' });
  const lastSuggestionRef = React.useRef('');

  React.useEffect(() => {
    if (!ready) return undefined;
    const positions = JSON.parse(positionSignature);
    const controller = new AbortController();
    let alive = true;
    const publish = (next) => { setState(next); onStatusChange(next); };
    if (!positions.length) {
      publish({ loading: false, addresses: [], unresolved: [], conflict: false, error: '' });
      return undefined;
    }
    publish({ loading: true, addresses: [], unresolved: [], conflict: false, error: '' });
    apiRequest('/temp-orders/pickup-addresses', {
      method: 'POST', body: JSON.stringify({ positions }), signal: controller.signal,
    }).then((response) => {
      if (!alive) return;
      const data = response?.data || {};
      const next = { loading: false, addresses: data.addresses || [], unresolved: data.unresolved || [], conflict: Boolean(data.conflict), error: '' };
      publish(next);
      const suggestion = !next.conflict && !next.unresolved.length && next.addresses.length === 1 ? next.addresses[0].text : '';
      onSuggest(suggestion, lastSuggestionRef.current);
      lastSuggestionRef.current = suggestion;
    }).catch((error) => {
      if (!alive) return;
      publish({ loading: false, addresses: [], unresolved: [], conflict: false, error: error?.message || t('pickup_address_load_error') });
    });
    return () => { alive = false; controller.abort(); };
  }, [contextKey, positionSignature, ready, onSuggest, onStatusChange, t]);

  return <Box sx={{ display: 'grid', gap: 1, minWidth: 0 }}>
    <TextField
      label={t('pickup_address_label')} value={value || ''} onChange={(event) => onChange(event.target.value)}
      multiline minRows={2} fullWidth inputProps={{ maxLength: 500 }}
      helperText={t('pickup_address_hint')}
    />
    {state.loading && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={16} /><Typography variant="caption">{t('pickup_address_loading')}</Typography></Box>}
    {state.error && <Alert severity="error">{t('pickup_address_load_error')} {state.error}</Alert>}
    {state.conflict && <Alert severity="error">
      {t('pickup_address_conflict')}
      {state.addresses.map((address) => <Typography variant="body2" key={address.key} sx={{ mt: 1, overflowWrap: 'anywhere' }}>
        {address.positions.map((position) => position.beNumber).join(', ')}: {address.text}
      </Typography>)}
    </Alert>}
    {!state.loading && state.unresolved.length > 0 && <Alert severity="warning">
      {t('pickup_address_unresolved')} {state.unresolved.map((position) => `${position.beNumber}${position.locationHint ? ` (${position.locationHint})` : ''}`).join(', ')}
    </Alert>}
  </Box>;
}

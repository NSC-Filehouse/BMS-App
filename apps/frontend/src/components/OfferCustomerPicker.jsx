import React from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

export default function OfferCustomerPicker({
  open,
  onClose,
  onSelect,
  copy = false,
}) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const [search, setSearch] = React.useState('');
  const [options, setOptions] = React.useState([]);
  const [value, setValue] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setValue(null);
      setSearch('');
      setError('');
    }
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiRequest(
          `/customers?q=${encodeURIComponent(search.trim())}&pageSize=30&includeInactive=1`,
        );
        if (active) setOptions(res.data || []);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {copy
          ? en
            ? 'Copy offer for which customer?'
            : 'Für welchen Kunden soll das Angebot kopiert werden?'
          : en
            ? 'Select customer'
            : 'Kunde auswählen'}
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Autocomplete
          options={options}
          value={value}
          onChange={(_, v) => setValue(v)}
          inputValue={search}
          onInputChange={(_, v) => setSearch(v)}
          filterOptions={(x) => x}
          isOptionEqualToValue={(a, b) => a.kd_KdNR === b.kd_KdNR}
          getOptionLabel={(x) =>
            `${x.kd_Name1 || ''} ${x.kd_Name2 || ''} (${x.kd_KdNR})`.trim()
          }
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              label={en ? 'Customer search' : 'Kunde suchen'}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && <CircularProgress size={18} />}{' '}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{en ? 'Cancel' : 'Abbrechen'}</Button>
        <Button
          variant="contained"
          disabled={!value}
          onClick={() => onSelect(String(value.kd_KdNR))}
        >
          {en ? 'Select' : 'Übernehmen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { findHistoricalIncoterm } from '../utils/incoterm.js';
import { optionPrice } from '../utils/optionDisplay.js';
import { isValidSalePrice } from '../utils/salePrice.js';

function OfferCustomerFields({ customer, incoterms, referencePrice }) {
  const { t } = useI18n();
  const [contacts, setContacts] = React.useState(null);
  const [contactError, setContactError] = React.useState('');
  const [contactId, setContactId] = React.useState('');
  const [salePrice, setSalePrice] = React.useState('');
  const [changedIncoterm, setChangedIncoterm] = React.useState(null);

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/customers/${encodeURIComponent(customer.id)}/order-contacts`, { signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        const rows = response.data;
        const selected = rows.find(contact => contact.ranking === 1) ?? (rows.length === 1 ? rows[0] : null);
        setContacts(rows);
        setContactId(selected?.id ?? '');
      })
      .catch(error => {
        if (!controller.signal.aborted) setContactError(error.message || t('loading_error'));
      });
    return () => controller.abort();
  }, [customer.id, t]);

  const selectedContact = contacts?.find(contact => contact.id === contactId);
  const priceInvalid = salePrice !== '' && !isValidSalePrice(salePrice);
  const incotermId = changedIncoterm ?? findHistoricalIncoterm(customer.lastIncoterm, incoterms)?.id ?? '';

  return <Stack spacing={1.25}>
    <Typography component="h3" variant="subtitle2">{customer.name}</Typography>
    {contactError && <Alert severity="error">{contactError}</Alert>}
    <TextField
      select size="small" fullWidth label={t('contact_label')} value={contactId}
      InputLabelProps={{ shrink: true }}
      disabled={!contacts?.length}
      onChange={event => setContactId(event.target.value)}
      helperText={selectedContact?.hasEmail === false ? t('option_offer_no_email')
        : contacts?.length === 0 ? t('option_offer_no_contacts') : undefined}
      FormHelperTextProps={selectedContact?.hasEmail === false ? { sx: { color: 'error.main' } } : undefined}
    >
      <MenuItem value="">{t('contact_select')}</MenuItem>
      {contacts?.map(contact => (
        <MenuItem key={contact.id} value={contact.id}>
          <Box>
            <Typography variant="body2">{contact.name}</Typography>
            {(contact.ranking || contact.position) && (
              <Typography variant="caption" color="text.secondary">
                {[contact.ranking && t('contact_rank_value', { rank: contact.ranking }), contact.position].filter(Boolean).join(' · ')}
              </Typography>
            )}
          </Box>
        </MenuItem>
      ))}
    </TextField>
    <Box>
      <TextField
        fullWidth size="small" type="number" label={t('order_sale_price_per_tonne')} value={salePrice}
        InputLabelProps={{ shrink: true }}
        onChange={event => setSalePrice(event.target.value)} inputProps={{ min: 0, step: 'any' }}
        error={priceInvalid} helperText={priceInvalid ? t('validation_sale_price_nonnegative') : undefined}
      />
      {referencePrice && <Typography display="block" variant="caption" color="text.secondary" sx={{ ml: 1.75, mt: 0.4 }}>
        {t('option_offer_reference_price', { price: referencePrice })}
      </Typography>}
    </Box>
    <TextField
      select size="small" fullWidth label={t('incoterm_label')} value={incotermId}
      InputLabelProps={{ shrink: true }}
      disabled={!incoterms.length} onChange={event => setChangedIncoterm(event.target.value)}
    >
      <MenuItem value=""><em>{t('incoterm_label')}</em></MenuItem>
      {incoterms.map(term => <MenuItem key={term.id} value={term.id}>{term.text}</MenuItem>)}
    </TextField>
  </Stack>;
}

function OptionOfferDialog({ customers, position, onClose }) {
  const { t } = useI18n();
  const titleId = React.useId();
  const [incoterms, setIncoterms] = React.useState([]);
  const [incotermError, setIncotermError] = React.useState('');
  const referencePrice = !position.priceNeedsReview && Number.isFinite(position.pricePerTonne)
    ? optionPrice(position, t) : '';

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest('/temp-orders/incoterms', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setIncoterms(response.data); })
      .catch(error => {
        if (!controller.signal.aborted) setIncotermError(error.message || t('loading_error'));
      });
    return () => controller.abort();
  }, [t]);

  return <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
    <DialogTitle id={titleId}>{t('option_offer_dialog')}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2} divider={<Divider />}>
        {incotermError && <Alert severity="error">{incotermError}</Alert>}
        {customers.map(customer => <OfferCustomerFields
          key={customer.id} customer={customer} incoterms={incoterms} referencePrice={referencePrice}
        />)}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{t('close_label')}</Button>
      <Button variant="contained" disabled>{t('option_offer_send')}</Button>
    </DialogActions>
  </Dialog>;
}

export default function OptionOfferCustomers({ customers, position, loading, error }) {
  const { t } = useI18n();
  const titleId = React.useId();
  const [selection, setSelection] = React.useState([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const chosen = customers.filter(customer => !customer.sent && selection.includes(customer.id));

  return <Card component="section" aria-labelledby={titleId} sx={{ mb: 1.5 }}>
    <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
      <Typography id={titleId} variant="subtitle1" component="h2" sx={{ mb: 0.5 }}>
        {t('option_offer_customers')}
      </Typography>
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && (customers.length ? (
        <Stack component="ul" divider={<Divider component="li" />} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {customers.map(customer => (
            <Box component="li" key={customer.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
              <Checkbox
                size="small" disabled={customer.sent} checked={!customer.sent && selection.includes(customer.id)}
                inputProps={{ 'aria-label': t('option_offer_select_customer', { name: customer.name }) }}
                onChange={event => {
                  const checked = event.target.checked;
                  setSelection(previous => checked ? [...previous, customer.id] : previous.filter(id => id !== customer.id));
                }}
              />
              <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{customer.name}</Typography>
              {customer.sent ? (
                <Box sx={{ width: 40, display: 'flex', justifyContent: 'center', color: 'text.secondary' }}>
                  <HourglassEmptyIcon fontSize="small" />
                </Box>
              ) : (
                <IconButton
                  color="primary" aria-label={t('option_offer_open', { name: customer.name })}
                  onClick={() => {
                    setSelection(previous => previous.includes(customer.id) ? previous : [...previous, customer.id]);
                    setDialogOpen(true);
                  }}
                >
                  <MailOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Stack>
      ) : <Typography variant="body2" color="text.secondary">{t('option_offer_no_customers')}</Typography>)}
      {dialogOpen && chosen.length > 0 && <OptionOfferDialog
        customers={chosen} position={position} onClose={() => setDialogOpen(false)}
      />}
    </CardContent>
  </Card>;
}

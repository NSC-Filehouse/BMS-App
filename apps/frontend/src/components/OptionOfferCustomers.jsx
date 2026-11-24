import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { findOptionOfferIncoterm, isFcaIncoterm } from '../utils/incoterm.js';
import { loadingLocationParts } from '../utils/loadingLocationDisplay.js';
import { isValidSalePrice } from '../utils/salePrice.js';
import CompactAddressOption from './CompactAddressOption.jsx';
import LoadingLocationDialog from './LoadingLocationDialog.jsx';
import SaleMarginHint from './SaleMarginHint.jsx';

const defaultQuantityKg = '24750';
const emptyDraft = Object.freeze({});

function selectedContact(draft) {
  const contacts = draft.contacts || [];
  if (draft.contactId != null) return contacts.find(contact => contact.id === draft.contactId);
  return [1, 2, 3].map(rank => contacts.find(contact => contact.ranking === rank)).find(Boolean)
    ?? (contacts.length === 1 ? contacts[0] : undefined);
}

function offerValues(customerId, draft, defaultTerm, incoterms, loadingLocation) {
  const term = draft.incotermId == null ? defaultTerm : incoterms.find(option => option.id === draft.incotermId);
  const contact = selectedContact(draft);
  return {
    customerId, contactId: contact?.id, hasEmail: Boolean(contact?.hasEmail),
    salePrice: draft.salePrice ?? '', quantityKg: draft.quantityKg ?? defaultQuantityKg,
    incotermId: term?.id, isFca: isFcaIncoterm(term?.text),
    pickup: isFcaIncoterm(term?.text) ? (draft.pickup ?? loadingLocation ?? '') : '',
  };
}

function validQuantity(value, maxQuantity) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 && (maxQuantity == null || quantity <= maxQuantity)
    && Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.00001;
}

function isValidOffer(values, maxQuantity) {
  return values.contactId && values.hasEmail && isValidSalePrice(values.salePrice) && validQuantity(values.quantityKg, maxQuantity)
    && values.incotermId && (!values.isFca || Boolean(values.pickup.trim()));
}

function PickupFields({ draft, loadingLocation, pickupLocations, pickup, update }) {
  const { t } = useI18n();
  const [adding, setAdding] = React.useState(false);
  const locations = [...new Set([loadingLocation, ...pickupLocations, draft.newLocation].filter(Boolean))];
  const address = locations.includes(pickup) && !draft.manualPickup ? pickup : '';
  return <Stack spacing={1}>
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField select size="small" fullWidth label={t('pickup_address_label')} value={address}
        InputLabelProps={{ shrink: true }}
        SelectProps={{ displayEmpty: true, renderValue: value => value
          ? <CompactAddressOption {...loadingLocationParts(value)} /> : t('option_offer_enter_pickup') }}
        onChange={event => update({ pickup: event.target.value, manualPickup: !event.target.value })}
      >
        <MenuItem value="">{t('option_offer_enter_pickup')}</MenuItem>
        {locations.map(location => <MenuItem key={location} value={location}>
          <CompactAddressOption {...loadingLocationParts(location)} />
        </MenuItem>)}
      </TextField>
      <Tooltip title={t('purchase_add_loading_location')}>
        <IconButton color="primary" onClick={() => setAdding(true)} aria-label={t('purchase_add_loading_location')}>
          <AddCircleOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
    {!address && <TextField size="small" required label={t('option_offer_pickup_place')} value={pickup}
      onChange={event => update({ pickup: event.target.value, manualPickup: true })} inputProps={{ maxLength: 1000 }} />}
    {adding && <LoadingLocationDialog onClose={() => setAdding(false)} onConfirm={location => {
      update({ pickup: location, newLocation: location, manualPickup: false });
      setAdding(false);
    }} />}
  </Stack>;
}

function OfferCustomerFields({ customer, draft, values, incoterms, loadingLocation, pickupLocations, updateDraft, costPrice, maxQuantity, previousPrice, contactsEndpoint }) {
  const { t, lang } = useI18n();
  const [contactError, setContactError] = React.useState('');
  const update = patch => updateDraft(customer.id, patch);

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest(contactsEndpoint || `/customers/${encodeURIComponent(customer.id)}/order-contacts`, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) updateDraft(customer.id, { contacts: response.data });
      })
      .catch(error => {
        if (!controller.signal.aborted) setContactError(error.message || t('loading_error'));
      });
    return () => controller.abort();
  }, [customer.id, t, updateDraft, contactsEndpoint]);

  const quantityInvalid = !validQuantity(values.quantityKg, maxQuantity);
  const priceInvalid = values.salePrice !== '' && !isValidSalePrice(values.salePrice);
  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const costHint = costPrice == null ? '' : new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(costPrice);

  return <Stack spacing={1.25}>
    <Typography component="h3" variant="subtitle2">{customer.name}</Typography>
    {contactError && <Alert severity="error">{contactError}</Alert>}
    <TextField
      select size="small" fullWidth label={t('contact_label')} value={values.contactId ?? ''}
      InputLabelProps={{ shrink: true }} disabled={!draft.contacts?.length}
      onChange={event => update({ contactId: event.target.value })}
      helperText={values.contactId && !values.hasEmail ? t('option_offer_no_email')
        : draft.contacts?.length === 0 ? t('option_offer_no_contacts') : undefined}
      FormHelperTextProps={values.contactId && !values.hasEmail ? { sx: { color: 'error.main' } } : undefined}
    >
      <MenuItem value="">{t('contact_select')}</MenuItem>
      {draft.contacts?.map(contact => (
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
    <Stack direction="row" spacing={1}>
      <TextField fullWidth required size="small" type="number" label={t('order_sale_price_per_tonne')} value={values.salePrice}
        InputLabelProps={{ shrink: true }} placeholder={costHint}
        onChange={event => update({ salePrice: event.target.value })} inputProps={{ min: 0, step: '0.0001' }}
        sx={{ '& input::placeholder': { opacity: 1, color: 'text.disabled' } }}
        InputProps={{ endAdornment: previousPrice !== undefined && (
          <InputAdornment position="end"><Tooltip title={t('option_offer_copy_price')}>
            <span><IconButton size="small" aria-label={t('option_offer_copy_price')} disabled={!isValidSalePrice(previousPrice)}
              onClick={() => update({ salePrice: previousPrice })}>
              <ContentCopyIcon fontSize="small" />
            </IconButton></span>
          </Tooltip></InputAdornment>
        ) }}
        error={priceInvalid} helperText={priceInvalid ? t('validation_sale_price_nonnegative') : undefined}
      />
      <TextField fullWidth required size="small" type="number" label={t('option_offer_quantity_kg')} value={values.quantityKg}
        InputLabelProps={{ shrink: true }} inputProps={{ min: 0.001, max: maxQuantity ?? undefined, step: '0.001' }}
        onChange={event => update({ quantityKg: event.target.value })} error={quantityInvalid}
        helperText={quantityInvalid && maxQuantity != null
          ? t('option_offer_available_kg', { amount: maxQuantity.toLocaleString(locale) }) : undefined}
      />
    </Stack>
    <SaleMarginHint amountInKg={values.quantityKg} salePrice={values.salePrice} costPrice={costPrice} />
    <TextField select size="small" fullWidth label={t('incoterm_label')} value={values.incotermId ?? ''}
      InputLabelProps={{ shrink: true }}
      disabled={!incoterms.length} onChange={event => update({ incotermId: event.target.value })}
    >
      <MenuItem value=""><em>{t('incoterm_label')}</em></MenuItem>
      {incoterms.map(term => <MenuItem key={term.id} value={term.id}>{term.text}</MenuItem>)}
    </TextField>
    {values.isFca && <PickupFields draft={draft} loadingLocation={loadingLocation} pickupLocations={pickupLocations}
      pickup={values.pickup} update={update} />}
  </Stack>;
}

function OptionOfferDialog({ customers, position, loadingLocation, endpoint, query, stock, sendEnabled, onQueued, onClose }) {
  const { t } = useI18n();
  const titleId = React.useId();
  const [incoterms, setIncoterms] = React.useState([]);
  const [pickupLocations, setPickupLocations] = React.useState(null);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [drafts, setDrafts] = React.useState({});
  const costPrice = !position.priceNeedsReview && Number.isFinite(position.pricePerTonne) ? position.pricePerTonne : null;
  const maxQuantity = Number.isFinite(position.remainingKg) ? position.remainingKg : null;
  const defaultTerm = findOptionOfferIncoterm(incoterms);
  const values = customers.map(customer => offerValues(customer.id, {
    quantityKg: stock && maxQuantity > 0 ? String(Math.min(Number(defaultQuantityKg), maxQuantity)) : undefined,
    ...drafts[customer.id],
  }, defaultTerm, incoterms, loadingLocation));
  const needsPickup = values.some(row => row.isFca);

  const updateDraft = React.useCallback((id, patch) => setDrafts(previous => ({
    ...previous, [id]: { ...previous[id], ...patch },
  })), []);

  React.useEffect(() => {
    const controller = new AbortController();
    apiRequest('/temp-orders/incoterms', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setIncoterms(response.data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message || t('loading_error')); });
    return () => controller.abort();
  }, [t]);

  React.useEffect(() => {
    if (!needsPickup || pickupLocations !== null) return undefined;
    const controller = new AbortController();
    apiRequest(`${endpoint}/pickup-locations${query}`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setPickupLocations(response.data); })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setPickupLocations([]);
        setError(cause.message || t('loading_error'));
      });
    return () => controller.abort();
  }, [endpoint, query, needsPickup, pickupLocations, t]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest(`${endpoint}/send${query}`, { method: 'POST', body: JSON.stringify({ customers: values }) });
      onQueued(response.data.customers);
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
    <DialogTitle id={titleId}>{t('option_offer_dialog')}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2} divider={<Divider />}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">{t('offer_release_customer_pdf')}</Typography>
        {customers.map((customer, index) => (
          <OfferCustomerFields key={customer.id} customer={customer} draft={drafts[customer.id] ?? emptyDraft}
            values={values[index]} incoterms={incoterms} loadingLocation={loadingLocation} updateDraft={updateDraft}
            pickupLocations={pickupLocations ?? []} costPrice={costPrice} maxQuantity={maxQuantity}
            previousPrice={values[index - 1]?.salePrice}
            contactsEndpoint={stock ? `${endpoint}/contacts/${encodeURIComponent(customer.id)}${query}` : undefined} />
        ))}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>{t('close_label')}</Button>
      <Button variant="contained" onClick={send} disabled={!sendEnabled || busy || !values.every(row => isValidOffer(row, maxQuantity))}>
        {t('option_offer_send')}
      </Button>
    </DialogActions>
  </Dialog>;
}

export default function OptionOfferCustomers({ customers, salesFilter, position, loadingLocation, loading, error, endpoint, query = '', stock = false, readOnly = false, sendEnabled, onQueued }) {
  const { t } = useI18n();
  const titleId = React.useId();
  const [selection, setSelection] = React.useState([]);
  const [salesCode, setSalesCode] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const salesCodes = [...new Set(customers.map(customer => customer.salesCode).filter(Boolean))].sort();
  const filter = salesFilter?.enabled && salesCodes.includes(salesCode) ? salesCode : '';
  const visible = filter ? customers.filter(customer => customer.salesCode === filter) : customers;
  const chosen = visible.filter(customer => !customer.sent && !customer.queued && selection.includes(customer.id));

  return <Card component="section" aria-labelledby={titleId} sx={{ mb: 1.5 }}>
    <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography id={titleId} variant="subtitle1" component="h2">{t('option_offer_customers')}</Typography>
        {!readOnly && <IconButton color="primary" aria-label={t('option_offer_open')} disabled={!chosen.length} onClick={() => setDialogOpen(true)}>
          <MailOutlineIcon sx={{ fontSize: 26 }} />
        </IconButton>}
      </Stack>
      {salesFilter?.enabled && <TextField select size="small" label={t('option_offer_sales_filter')} value={filter}
        InputLabelProps={{ shrink: true }}
        SelectProps={{ displayEmpty: true, MenuProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.8rem' } } } }}
        onChange={event => { setSalesCode(event.target.value); setSelection([]); }}
        sx={{ mb: 1, minWidth: 130, '& .MuiSelect-select': { fontSize: '0.8rem' } }}>
        <MenuItem value="">{t('option_offer_all_sales')}</MenuItem>
        {salesCodes.map(code => <MenuItem key={code} value={code}>{code}</MenuItem>)}
      </TextField>}
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && (visible.length ? (
        <Stack component="ul" divider={<Divider component="li" />} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visible.map(customer => (
            <Box component="li" key={customer.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
              {!readOnly && <Checkbox size="small" disabled={customer.sent || customer.queued}
                checked={!customer.sent && !customer.queued && selection.includes(customer.id)}
                inputProps={{ 'aria-label': t('option_offer_select_customer', { name: customer.name }) }}
                onChange={event => {
                  const checked = event.target.checked;
                  setSelection(previous => checked ? [...previous, customer.id] : previous.filter(id => id !== customer.id));
                }}
              />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{customer.name}</Typography>
                {customer.salesCode && <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.2 }}>
                  {customer.salesCode}
                </Typography>}
              </Box>
              {customer.sent && <Box sx={{ width: 40, display: 'flex', justifyContent: 'center', color: 'text.secondary' }}>
                <HourglassEmptyIcon fontSize="small" />
              </Box>}
              {customer.queued && <Typography variant="caption" color="text.secondary">{t('option_offer_queued')}</Typography>}
              {customer.failed && <Typography variant="caption" color="error.main">{t('option_offer_failed')}</Typography>}
            </Box>
          ))}
        </Stack>
      ) : <Typography variant="body2" color="text.secondary">{t('option_offer_no_customers')}</Typography>)}
      {!readOnly && dialogOpen && chosen.length > 0 && <OptionOfferDialog
        customers={chosen} position={position} loadingLocation={loadingLocation} endpoint={endpoint} query={query} stock={stock}
        sendEnabled={sendEnabled} onQueued={onQueued} onClose={() => setDialogOpen(false)}
      />}
    </CardContent>
  </Card>;
}

import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, apiRequestBlob } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { findDefaultIncoterm, findOptionOfferIncoterm, isFcaIncoterm } from '../utils/incoterm.js';
import { loadingLocationParts } from '../utils/loadingLocationDisplay.js';
import { isValidSalePrice } from '../utils/salePrice.js';
import { defaultOfferQuantityKg } from '../utils/offers.js';
import { hasRecordedOffer } from '../utils/optionDisplay.js';
import CompactAddressOption from './CompactAddressOption.jsx';
import LoadingLocationDialog from './LoadingLocationDialog.jsx';
import SaleMarginHint from './SaleMarginHint.jsx';

const emptyDraft = Object.freeze({});
const OptionPdfDialog = React.lazy(() => import('./OptionPdfDialog.jsx'));

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
    salePrice: draft.salePrice ?? '', quantityKg: draft.quantityKg ?? defaultOfferQuantityKg,
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
        SelectProps={{ displayEmpty: true, classes: { select: 'address-select' },
          MenuProps: { MenuListProps: { className: 'address-select-list' } },
          renderValue: value => value
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
      {!values.incotermId && <MenuItem value="" disabled>{t('incoterm_label')}</MenuItem>}
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
  const maxQuantity = stock && Number.isFinite(position.remainingKg) ? position.remainingKg : null;
  const defaultTerm = findOptionOfferIncoterm(incoterms) || findDefaultIncoterm(incoterms);
  const values = customers.map(customer => offerValues(customer.id, {
    quantityKg: stock && maxQuantity > 0 ? String(Math.min(Number(defaultOfferQuantityKg), maxQuantity)) : undefined,
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

export default function OptionOfferCustomers({ customers, salesFilter, position, loadingLocation, loading, error, endpoint, query = '', stock = false, readOnly = false, returnTo, sendEnabled, onQueued }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const titleId = React.useId();
  const [selection, setSelection] = React.useState([]);
  const [salesCode, setSalesCode] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [offerPdf, setOfferPdf] = React.useState(null);
  const [offerOpenError, setOfferOpenError] = React.useState('');
  const pdfRequest = React.useRef(null);
  React.useEffect(() => () => pdfRequest.current?.abort(), []);

  async function openOffer(event, offerId) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pdfRequest.current?.abort();
    const controller = new AbortController();
    pdfRequest.current = controller;
    setOfferOpenError('');
    try {
      const blob = await apiRequestBlob(`/temp-offers/${offerId}/pdf`, { signal: controller.signal });
      if (!controller.signal.aborted) setOfferPdf({ id: offerId, blob });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause.code === 'OFFER_PDF_NOT_READY') navigate(`/temp-offers/${offerId}`, { state: { returnTo } });
      else setOfferOpenError(cause.message || t('loading_error'));
    } finally {
      if (pdfRequest.current === controller) pdfRequest.current = null;
    }
  }

  const customerSalesCodes = customer => customer.assignments?.map(assignment => assignment.salesCode) ?? [customer.salesCode];
  const salesCodes = [...new Set(customers.flatMap(customerSalesCodes).filter(Boolean))].sort();
  const filter = salesFilter?.enabled && salesCodes.includes(salesCode) ? salesCode : '';
  const visible = customers.filter(customer => (!loading && !error || !stock && hasRecordedOffer(customer))
    && (!filter || customerSalesCodes(customer).includes(filter) || !stock && hasRecordedOffer(customer)));
  if (!stock) visible.sort((a, b) => a.name.localeCompare(b.name, lang));
  const canSelect = customer => !loading && !error && !customer.readOnly && !customer.sent && !customer.queued && !customer.offerStatus;
  const chosen = visible.filter(customer => canSelect(customer) && selection.includes(customer.id));

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
        SelectProps={{ displayEmpty: true }}
        onChange={event => { setSalesCode(event.target.value); setSelection([]); }}
        sx={{ mb: 1, minWidth: 130 }}>
        <MenuItem value="">{t('option_offer_all_sales')}</MenuItem>
        {salesCodes.map(code => <MenuItem key={code} value={code}>{code}</MenuItem>)}
      </TextField>}
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error}</Alert>}
      {offerOpenError && <Alert severity="error">{offerOpenError}</Alert>}
      {visible.length ? (
        <Stack component="ul" divider={<Divider component="li" />} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visible.map(customer => {
            const status = customer.offerStatus === 4 ? { Icon: CheckIcon, color: 'success', label: 'temp_offer_status_converted' }
              : customer.offerStatus === 5 ? { Icon: CloseIcon, color: 'error', label: 'temp_offer_status_not_interested' }
              : customer.sent || customer.queued ? { Icon: HourglassEmptyIcon, color: 'primary', label: customer.queued ? 'option_offer_queued' : 'option_offer_sent' }
              : null;
            const statusIcon = status && <Tooltip title={t(status.label)}>
              <Box sx={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                <status.Icon color={status.color} fontSize="small" titleAccess={t(status.label)} />
              </Box>
            </Tooltip>;
            return <Box component="li" key={customer.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
                {!stock && statusIcon}
                {!readOnly && (stock || !status) && <Checkbox size="small" disabled={!canSelect(customer)}
                  checked={canSelect(customer) && selection.includes(customer.id)}
                  inputProps={{ 'aria-label': t('option_offer_select_customer', { name: customer.name }) }}
                  onChange={event => {
                    const checked = event.target.checked;
                    setSelection(previous => checked ? [...previous, customer.id] : previous.filter(id => id !== customer.id));
                  }}
                />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{customer.name}</Typography>
                  {((!stock && customer.offerId) || customer.assignments?.length || customer.salesCode) ? (
                    <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 0.75 }}>
                      {!stock && customer.offerId && <Typography component={Link} variant="caption" color="primary.main"
                        to={`/temp-offers/${customer.offerId}`} state={{ returnTo }} onClick={event => openOffer(event, customer.offerId)}>
                        {t('option_offer_id_link', { id: customer.offerId })}
                      </Typography>}
                      {(customer.assignments?.length || customer.salesCode) ? <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1.2 }}>
                        {customer.assignments?.map(({ salesCode, mandant }) => `${salesCode}(${mandant})`).join(' ') ?? customer.salesCode}
                      </Typography> : null}
                    </Box>
                  ) : null}
                  {!stock && !status && customer.failed && <Typography variant="caption" color="error.main">{t('option_offer_failed')}</Typography>}
                </Box>
                {stock && statusIcon}
                {stock && !status && customer.failed && <Typography variant="caption" color="error.main">{t('option_offer_failed')}</Typography>}
              </Box>
            </Box>;
          })}
        </Stack>
      ) : !loading && !error && <Typography variant="body2" color="text.secondary">{t('option_offer_no_customers')}</Typography>}
      {!readOnly && dialogOpen && chosen.length > 0 && <OptionOfferDialog
        customers={chosen} position={position} loadingLocation={loadingLocation} endpoint={endpoint} query={query} stock={stock}
        sendEnabled={sendEnabled} onQueued={onQueued} onClose={() => setDialogOpen(false)}
      />}
      {offerPdf && <React.Suspense fallback={<CircularProgress size={20} />}>
        <OptionPdfDialog key={offerPdf.id} offer={offerPdf} pdfBlob={offerPdf.blob} onClose={() => setOfferPdf(null)} />
      </React.Suspense>}
    </CardContent>
  </Card>;
}

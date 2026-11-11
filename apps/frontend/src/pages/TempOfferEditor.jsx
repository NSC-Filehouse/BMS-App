import React from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { getMandant } from '../utils/mandant.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import { useI18n } from '../utils/i18n.jsx';
import { navigateToReturn } from '../utils/navigation.js';
import {
  blankOffer,
  changeOfferCustomer,
  copyOffer,
  newOfferPosition,
} from '../utils/offers.js';
import { DisclosureBackButton } from '../components/DisclosureBack.jsx';
import OfferCustomerPicker from '../components/OfferCustomerPicker.jsx';
import OfferArticlePicker from '../components/OfferArticlePicker.jsx';
import OfferPositionEditor, {
  OfferPositionFields,
} from '../components/OfferPositionEditor.jsx';

const dates = (o) => ({
  ...o,
  positions: o.positions.map((p) => ({
    ...p,
    deliveryDate: p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : '',
    valutaDate: p.valutaDate ? String(p.valutaDate).slice(0, 10) : '',
    reserveUntil: p.reserveUntil ? String(p.reserveUntil).slice(0, 10) : '',
  })),
});
export default function TempOfferEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const en = lang === 'en';
  const mandant = getMandant();
  const copyId = location.state?.copyFrom;
  const initialCustomer = location.state?.customerId;
  const returnTo = location.state?.returnTo;
  const [form, setForm] = React.useState(blankOffer);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [options, setOptions] = React.useState({
    payments: [],
    packagingTypes: [],
    incoterms: [],
  });
  const [defaults, setDefaults] = React.useState({
    contacts: [],
    deliveryAddresses: [],
  });
  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customers, setCustomers] = React.useState([]);
  const [copyCustomerOpen, setCopyCustomerOpen] = React.useState(false);
  const [articleOpen, setArticleOpen] = React.useState(false);
  const [pending, setPending] = React.useState([]);
  const [candidate, setCandidate] = React.useState(null);
  const [positionError, setPositionError] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [leave, setLeave] = React.useState(false);
  const [deleteLast, setDeleteLast] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [draftKey, setDraftKey] = React.useState('');
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const [me, meta] = await Promise.all([
        apiRequest('/me'),
        apiRequest('/temp-offers/meta'),
      ]);
      const opts = meta.data;
      let next = id
        ? dates((await apiRequest(`/temp-offers/${id}`)).data)
        : copyId
          ? dates(copyOffer((await apiRequest(`/temp-offers/${copyId}`)).data))
          : blankOffer();
      if (id && ![0, 3].includes(next.status)) {
        navigate(`/temp-offers/${id}`, { replace: true, state: { returnTo } });
        return;
      }
      if (!next.deliveryTermsId) {
        const incoterm =
          opts.incoterms.find((i) => /^FCA\b/i.test(i.text)) ||
          opts.incoterms[0];
        next = {
          ...next,
          deliveryTermsId: incoterm?.id || null,
          deliveryTerms: incoterm?.text || '',
        };
      }
      let d = { contacts: [], deliveryAddresses: [] };
      const customerId =
        next.customerId ||
        (!id && !copyId ? initialCustomer || getSelectedCustomer()?.id : null);
      if (customerId) {
        d = (
          await apiRequest(
            `/temp-offers/customer-defaults/${encodeURIComponent(customerId)}`,
          )
        ).data;
        if (!next.customerId) next = changeOfferCustomer(next, d);
      }
      if (!active) return;
      setForm(next);
      setOptions(opts);
      setDefaults(d);
      setCustomerQuery(next.customerName || '');
      setDirty(false);
      const key = `bms.offerDraft.v2.${me.userId}.${mandant}.${copyId ? `copy-${copyId}` : id || 'new'}`;
      setDraftKey(key);
      let saved = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      } catch {}
      if (
        saved?.form &&
        Array.isArray(saved.form.positions) &&
        Date.now() - saved.at < 7 * 86400000 &&
        (!id || saved.form.version === next.version)
      )
        setDraft(saved.form);
      else if (copyId && !next.customerId) setCopyCustomerOpen(true);
      else if (initialCustomer && !id && !copyId) setArticleOpen(true);
    })()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, copyId, initialCustomer, mandant, navigate]);
  React.useEffect(() => {
    let active = true;
    const q = customerQuery.trim();
    if (q.length < 3) return;
    const timer = setTimeout(
      () =>
        apiRequest(
          `/customers?q=${encodeURIComponent(q)}&includeInactive=1&pageSize=30`,
        )
          .then((r) => {
            if (active) setCustomers(r.data || []);
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      300,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerQuery]);
  React.useEffect(() => {
    if (!dirty || !draftKey || draft) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ at: Date.now(), form }),
        );
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [form, dirty, draftKey, draft]);
  React.useEffect(() => {
    if (!dirty) return;
    const listener = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  function patch(values) {
    setDirty(true);
    setForm((p) => ({ ...p, ...values }));
  }
  async function chooseCustomer(customerId) {
    if (!customerId) return;
    setSaving(true);
    setError('');
    try {
      const d = (
        await apiRequest(
          `/temp-offers/customer-defaults/${encodeURIComponent(customerId)}`,
        )
      ).data;
      setDefaults(d);
      setForm((p) => changeOfferCustomer(p, d));
      setCustomerQuery(d.customerName);
      setDirty(true);
      setCopyCustomerOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const clearDraft = () => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
  };
  const back = () =>
    navigateToReturn(
      navigate,
      returnTo,
      id ? `/temp-offers/${id}` : '/temp-offers',
    );
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest(
        id ? `/temp-offers/${id}` : '/temp-offers',
        { method: id ? 'PUT' : 'POST', body: JSON.stringify(form) },
      );
      clearDraft();
      setDirty(false);
      navigate(`/temp-offers/${result.data.id}`, {
        replace: true,
        state: { returnTo },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function deleteOffer() {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/temp-offers/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ version: form.version }),
      });
      clearDraft();
      setDirty(false);
      navigateToReturn(navigate, returnTo, '/temp-offers');
    } catch (e) {
      setError(e.message);
      setDeleteLast(false);
    } finally {
      setSaving(false);
    }
  }
  function removePosition(index) {
    if (id && form.positions.length === 1) {
      setDeleteLast(true);
      return;
    }
    patch({ positions: form.positions.filter((_, i) => i !== index) });
  }
  function receiveArticles(articles) {
    setArticleOpen(false);
    setPending(articles.slice(1));
    setCandidate(newOfferPosition(articles[0]));
    setPositionError('');
  }
  function addPosition() {
    if (
      !(Number(candidate.quantity) > 0) ||
      candidate.price === '' ||
      Number(candidate.price) < 0 ||
      !candidate.deliveryDate
    ) {
      setPositionError(
        en
          ? 'Please enter quantity, sales price and delivery date.'
          : 'Bitte Menge, Verkaufspreis und Lieferdatum angeben.',
      );
      return;
    }
    patch({ positions: [...form.positions, candidate] });
    setPositionError('');
    if (pending.length) {
      setCandidate(newOfferPosition(pending[0]));
      setPending(pending.slice(1));
    } else setCandidate(null);
  }
  const isFca = /^FCA\b/i.test(form.deliveryTerms);
  const selectedCustomer = form.customerId
    ? { kd_KdNR: form.customerId, kd_Name1: form.customerName }
    : null;
  const customerOptions =
    selectedCustomer &&
    !customers.some((c) => String(c.kd_KdNR) === String(form.customerId))
      ? [selectedCustomer, ...customers]
      : customers;
  if (loading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
        <CircularProgress />
      </Box>
    );
  return (
    <Box
      sx={{
        maxWidth: 900,
        width: '100%',
        minWidth: 0,
        mx: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          minWidth: 0,
        }}
      >
        <DisclosureBackButton
          aria-label="back"
          onClick={() => (dirty ? setLeave(true) : back())}
        >
          <ArrowBackIcon />
        </DisclosureBackButton>
        <Typography variant="h5" sx={{ flex: 1, minWidth: 0 }}>
          {id
            ? en
              ? 'Edit offer'
              : 'Angebot bearbeiten'
            : copyId
              ? en
                ? 'Copy offer'
                : 'Angebot kopieren'
              : en
                ? 'New offer'
                : 'Angebot anlegen'}
        </Typography>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card sx={{ width: '100%', minWidth: 0 }}>
        <CardContent
          component="form"
          noValidate
          onSubmit={save}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
        >
          <Autocomplete
            options={customerOptions}
            value={selectedCustomer}
            inputValue={customerQuery}
            isOptionEqualToValue={(a, b) =>
              String(a.kd_KdNR) === String(b.kd_KdNR)
            }
            getOptionLabel={(o) =>
              String(o.kd_Name1 || o.kd_Name2 || o.kd_KdNR || '')
            }
            filterOptions={(x) => x}
            onChange={(_, v) => {
              if (v) {
                void chooseCustomer(v.kd_KdNR);
                return;
              }
              const empty = {
                customerId: '',
                customerName: '',
                customerAddress: '',
                contacts: [],
                deliveryAddresses: [],
                paymentId: null,
                paymentText: '',
              };
              setDefaults(empty);
              setCustomerQuery('');
              setDirty(true);
              setForm((previous) => changeOfferCustomer(previous, empty));
            }}
            onInputChange={(_, v, reason) => {
              if (reason === 'input') setCustomerQuery(v);
            }}
            renderInput={(params) => (
              <TextField {...params} label={t('customer_select')} fullWidth />
            )}
          />
          <TextField
            label={t('order_customer')}
            value={form.customerName}
            onChange={(e) => patch({ customerName: e.target.value })}
            fullWidth
          />
          <TextField
            label={t('address_label')}
            value={form.customerAddress}
            fullWidth
            disabled
          />
          <TextField
            select
            label={t('contact_label')}
            SelectProps={{ displayEmpty: true }}
            InputLabelProps={{ shrink: true }}
            value={form.contactId || ''}
            disabled={!form.customerId || !defaults.contacts.length}
            onChange={(e) => {
              const c = defaults.contacts.find(
                (c) => Number(c.id) === Number(e.target.value),
              );
              patch({ contactId: c?.id || null, contact: c?.name || '' });
            }}
            fullWidth
          >
            <MenuItem value="">
              {en ? 'Please select' : 'Bitte wählen'}
            </MenuItem>
            {defaults.contacts.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Box sx={{ display: 'grid' }}>
                  <Typography variant="body2">{c.name}</Typography>
                  {(c.ranking || c.position || c.email) && (
                    <Typography variant="caption" color="text.secondary">
                      {[
                        c.ranking ? `Top ${c.ranking}` : '',
                        c.position,
                        c.email,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={en ? 'Customer reference' : 'Kundenreferenz'}
            value={form.customerReference}
            onChange={(e) => patch({ customerReference: e.target.value })}
            inputProps={{ maxLength: 20 }}
            fullWidth
          />
          <TextField
            select
            label={t('incoterm_label')}
            value={form.deliveryTermsId || ''}
            onChange={(e) => {
              const i = options.incoterms.find(
                (i) => Number(i.id) === Number(e.target.value),
              );
              patch({
                deliveryTermsId: i?.id || null,
                deliveryTerms: i?.text || '',
                deliveryAddressId: null,
                deliveryAddress: '',
                deliveryAddressManual: /^FCA\b/i.test(i?.text || ''),
              });
            }}
            fullWidth
          >
            <MenuItem value="" disabled>
              {en ? 'Please select' : 'Bitte wählen'}
            </MenuItem>
            {options.incoterms.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.text}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t('packaging_type_label')}
            value={form.packagingId || ''}
            onChange={(e) => {
              const p = options.packagingTypes.find(
                (p) => Number(p.id) === Number(e.target.value),
              );
              patch({ packagingId: p?.id || null, packaging: p?.text || '' });
            }}
            fullWidth
          >
            <MenuItem value="" disabled>
              {t('packaging_type_select')}
            </MenuItem>
            {options.packagingTypes.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.text}
              </MenuItem>
            ))}
          </TextField>
          {isFca || form.deliveryAddressManual ? (
            <TextField
              label={t(
                isFca ? 'pickup_address_label' : 'delivery_address_label',
              )}
              value={form.deliveryAddress}
              onChange={(e) =>
                patch({
                  deliveryAddress: e.target.value,
                  deliveryAddressId: null,
                  deliveryAddressManual: true,
                })
              }
              fullWidth
            />
          ) : (
            <TextField
              select
              label={t('delivery_address_label')}
              value={form.deliveryAddressId || ''}
              onChange={(e) => {
                const a = defaults.deliveryAddresses.find(
                  (a) => String(a.id) === String(e.target.value),
                );
                patch({
                  deliveryAddressId: a?.id || null,
                  deliveryAddress: a?.text || '',
                });
              }}
              fullWidth
            >
              <MenuItem value="">
                {defaults.deliveryAddresses.length
                  ? en
                    ? 'Please select'
                    : 'Bitte wählen'
                  : '-'}
              </MenuItem>
              {defaults.deliveryAddresses.map((a) => (
                <MenuItem key={a.id} value={a.id} sx={{ whiteSpace: 'normal' }}>
                  {a.text}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', pl: 0.5, mt: -0.35 }}
          >
            {t('current_payment_condition')}:{' '}
            {defaults.paymentText || t('payment_select_placeholder')}
          </Typography>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Checkbox
                checked={form.specialPaymentCondition}
                onChange={(e) =>
                  patch(
                    e.target.checked
                      ? { specialPaymentCondition: true }
                      : {
                          specialPaymentCondition: false,
                          paymentId: defaults.paymentId || null,
                          paymentText: defaults.paymentText || '',
                        },
                  )
                }
              />
            }
            label={t('special_payment_condition')}
          />
          {(form.specialPaymentCondition || !defaults.paymentId) && (
            <TextField
              select
              label={t('special_payment_text_label')}
              value={form.paymentId || ''}
              onChange={(e) => {
                const p = options.payments.find(
                  (p) => Number(p.id) === Number(e.target.value),
                );
                patch({ paymentId: p?.id || null, paymentText: p?.text || '' });
              }}
              fullWidth
            >
              <MenuItem value="" disabled>
                {t('payment_select_placeholder')}
              </MenuItem>
              {options.payments.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.text}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label={en ? 'Internal note' : 'Interne Bemerkungen'}
            value={form.internalNote}
            onChange={(e) => patch({ internalNote: e.target.value })}
            multiline
            minRows={3}
            fullWidth
          />
          <Box sx={{ mt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.25,
                minWidth: 0,
              }}
            >
              <Typography variant="subtitle2">
                {t('order_positions_count')}: {form.positions.length}
              </Typography>
              <IconButton
                size="small"
                color="primary"
                aria-label="add-position"
                disabled={!form.customerId}
                onClick={() => setArticleOpen(true)}
              >
                <AddCircleOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {form.positions.map((p, i) => (
                <OfferPositionEditor
                  key={p.lineKey}
                  position={p}
                  onChange={(values) =>
                    patch({
                      positions: form.positions.map((x, j) =>
                        j === i ? { ...x, ...values } : x,
                      ),
                    })
                  }
                  onRemove={() => removePosition(i)}
                />
              ))}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !form.customerId || !form.positions.length}
            >
              {t('save_label')}
            </Button>
          </Box>
        </CardContent>
      </Card>
      <OfferCustomerPicker
        open={copyCustomerOpen}
        copy
        onClose={() => setCopyCustomerOpen(false)}
        onSelect={chooseCustomer}
      />
      <OfferArticlePicker
        open={articleOpen}
        onClose={() => setArticleOpen(false)}
        onAdd={receiveArticles}
      />
      <Dialog
        open={Boolean(candidate)}
        onClose={() => setCandidate(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('product_select')}</DialogTitle>
        <DialogContent
          sx={{ display: 'grid', gap: 1.25, pt: '16px !important' }}
        >
          {positionError && <Alert severity="error">{positionError}</Alert>}
          {candidate && (
            <>
              <TextField
                label={t('product_select')}
                value={candidate.article}
                InputProps={{ readOnly: true }}
                fullWidth
              />
              <OfferPositionFields
                position={candidate}
                onChange={(v) => setCandidate((p) => ({ ...p, ...v }))}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCandidate(null)}>{t('back_label')}</Button>
          <Button variant="contained" onClick={addPosition}>
            {en ? 'Add' : 'Hinzufügen'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={deleteLast}
        onClose={() => !saving && setDeleteLast(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {en ? 'Delete last position?' : 'Letzte Position löschen?'}
        </DialogTitle>
        <DialogContent>
          {en
            ? 'Deleting the last position also deletes this offer and its own reservations.'
            : 'Mit der letzten Position wird auch dieses Angebot einschließlich seiner eigenen Reservierungen gelöscht.'}
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDeleteLast(false)}>
            {t('back_label')}
          </Button>
          <Button
            disabled={saving}
            color="error"
            variant="contained"
            onClick={deleteOffer}
          >
            {t('delete_label')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={leave} onClose={() => setLeave(false)}>
        <DialogTitle>
          {en
            ? 'Discard unsaved changes?'
            : 'Ungespeicherte Änderungen verwerfen?'}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setLeave(false)}>
            {en ? 'Continue editing' : 'Weiter bearbeiten'}
          </Button>
          <Button
            onClick={() => {
              clearDraft();
              setDirty(false);
              back();
            }}
          >
            {en ? 'Discard' : 'Verwerfen'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(draft)}>
        <DialogTitle>
          {en
            ? 'Restore unsaved offer?'
            : 'Ungespeichertes Angebot wiederherstellen?'}
        </DialogTitle>
        <DialogActions>
          <Button
            onClick={() => {
              clearDraft();
              setDraft(null);
            }}
          >
            {en ? 'Discard' : 'Verwerfen'}
          </Button>
          <Button
            onClick={async () => {
              setForm(draft);
              setDirty(true);
              setDraft(null);
              if (draft.customerId) {
                try {
                  const d = (
                    await apiRequest(
                      `/temp-offers/customer-defaults/${encodeURIComponent(draft.customerId)}`,
                    )
                  ).data;
                  setDefaults(d);
                  setCustomerQuery(draft.customerName);
                } catch (e) {
                  setError(e.message);
                }
              }
            }}
          >
            {en ? 'Restore' : 'Wiederherstellen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import React from 'react';
import {
  Alert,
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
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { getMandant } from '../utils/mandant.js';
import { getSelectedCustomer } from '../utils/customerSelection.js';
import { createCustomerOperationId } from '../utils/customerCreation.js';
import { useI18n } from '../utils/i18n.jsx';
import { navigateToReturn } from '../utils/navigation.js';
import {
  blankOffer,
  changeOfferCustomer,
  copyOffer,
  estimateOffer,
  money,
  newOfferPosition,
} from '../utils/offers.js';
import OfferCustomerPicker from '../components/OfferCustomerPicker.jsx';
import OfferArticlePicker from '../components/OfferArticlePicker.jsx';
import OfferPositionEditor from '../components/OfferPositionEditor.jsx';

function formDates(o) {
  const date = (v) => (v ? String(v).slice(0, 10) : '');
  return {
    ...o,
    offerDate: date(o.offerDate),
    inquiryDate: date(o.inquiryDate),
    validUntil: date(o.validUntil),
    positions: o.positions.map((p) => ({
      ...p,
      deliveryDate: date(p.deliveryDate),
      reserveUntil: date(p.reserveUntil),
    })),
  };
}
export default function TempOfferEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const en = lang === 'en';
  const mandant = getMandant();
  const copyId = location.state?.copyFrom;
  const initialCustomer = location.state?.customerId;
  const [form, setForm] = React.useState(blankOffer);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [articleOpen, setArticleOpen] = React.useState(false);
  const [defaults, setDefaults] = React.useState({
    contacts: [],
    payments: [],
  });
  const [tab, setTab] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const [leave, setLeave] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [draftKey, setDraftKey] = React.useState('');
  const returnTo = location.state?.returnTo;
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const me = await apiRequest('/me');
      const key = `bms.offerDraft.v1.${me.userId}.${mandant}.${copyId ? `copy-${copyId}` : id || 'new'}`;
      let next = id
        ? formDates((await apiRequest(`/temp-offers/${id}`)).data)
        : copyId
          ? formDates(
              copyOffer((await apiRequest(`/temp-offers/${copyId}`)).data),
            )
          : blankOffer();
      if (id && ![0, 3].includes(next.status)) {
        navigate(`/temp-offers/${id}`, { replace: true, state: { returnTo } });
        return;
      }
      let customerDefaults = null;
      const customerId =
        next.customerId ||
        (!id && !copyId ? initialCustomer || getSelectedCustomer()?.id : null);
      if (customerId) {
        customerDefaults = (
          await apiRequest(
            `/temp-offers/customer-defaults/${encodeURIComponent(customerId)}?language=${next.language}`,
          )
        ).data;
        if (!next.customerId)
          next = changeOfferCustomer(next, customerDefaults);
      }
      if (!active) return;
      setForm(next);
      setDefaults(customerDefaults || { contacts: [], payments: [] });
      setDraftKey(key);
      setDirty(false);
      let saved = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      } catch {
        /* optional browser draft */
      }
      if (
        saved?.form &&
        Array.isArray(saved.form.positions) &&
        Date.now() - saved.at < 7 * 86400000 &&
        (!id || saved.form.version === next.version)
      )
        setDraft(saved.form);
      else if (!next.customerId) setCustomerOpen(true);
      else if (!id && !copyId && initialCustomer) setArticleOpen(true);
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
  }, [id, copyId, initialCustomer, mandant, navigate]); // Location return state must not reset a form.
  React.useEffect(() => {
    if (!dirty || !draftKey || draft) return;
    const h = setTimeout(() => {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ at: Date.now(), form }),
        );
      } catch {
        /* optional */
      }
    }, 400);
    return () => clearTimeout(h);
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
    setForm((prev) => ({ ...prev, ...values }));
  }
  async function selectCustomer(customerId) {
    setSaving(true);
    setError('');
    try {
      const d = (
        await apiRequest(
          `/temp-offers/customer-defaults/${encodeURIComponent(customerId)}?language=${form.language}`,
        )
      ).data;
      setDefaults(d);
      setForm((prev) => changeOfferCustomer(prev, d));
      setDirty(true);
      setCustomerOpen(false);
      if (!form.positions.length && !id) setArticleOpen(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    if (!form.customerId) {
      setCustomerOpen(true);
      return;
    }
    if (!form.positions.length) {
      setError(en ? 'Please add articles.' : 'Bitte Artikel hinzufügen.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiRequest(id ? `/temp-offers/${id}` : '/temp-offers', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* optional */
      }
      setDirty(false);
      navigate(`/temp-offers/${res.data.id}`, {
        replace: true,
        state: { returnTo },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const field = (key, label, extra = {}) => (
    <TextField
      size="small"
      label={label}
      value={form[key] ?? ''}
      onChange={(e) => patch({ [key]: e.target.value })}
      {...extra}
    />
  );
  const sums = estimateOffer(form);
  const back = () =>
    navigateToReturn(
      navigate,
      returnTo,
      id ? `/temp-offers/${id}` : '/temp-offers',
    );
  if (loading) return <CircularProgress />;
  if (error && !form.customerId && !customerOpen && !draft)
    return (
      <Alert
        severity="error"
        action={<Button onClick={back}>{en ? 'Back' : 'Zurück'}</Button>}
      >
        {error}
      </Alert>
    );
  return (
    <Box
      component="form"
      noValidate
      onSubmit={save}
      sx={{ maxWidth: 1000, mx: 'auto', display: 'grid', gap: 2, minWidth: 0 }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        <Typography variant="h5" sx={{ flex: 1 }}>
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
                : 'Neues Angebot'}
        </Typography>
        <Button onClick={() => (dirty ? setLeave(true) : back())}>
          {en ? 'Back' : 'Zurück'}
        </Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={700}>
                {form.customerName ||
                  (en ? 'No customer selected' : 'Kein Kunde gewählt')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {form.customerId} · {form.customerAddress}
              </Typography>
            </Box>
            <Button disabled={saving} onClick={() => setCustomerOpen(true)}>
              {en ? 'Change customer' : 'Kunde ändern'}
            </Button>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1,
            }}
          >
            {field('offerDate', en ? 'Offer date' : 'Angebotsdatum', {
              type: 'date',
              required: true,
              InputLabelProps: { shrink: true },
            })}
            {field('language', en ? 'Document language' : 'Dokumentsprache', {
              select: true,
              children: [
                <MenuItem key="DE" value="DE">
                  Deutsch
                </MenuItem>,
                <MenuItem key="EN" value="EN">
                  English
                </MenuItem>,
              ],
            })}
            <TextField
              size="small"
              select
              label={en ? 'Contact' : 'Ansprechpartner'}
              value={form.contactId || ''}
              onChange={(e) => {
                const c = defaults.contacts.find(
                  (c) => Number(c.id) === Number(e.target.value),
                );
                patch({
                  contactId: c?.id || null,
                  contact: c?.name || '',
                  department: c?.department || '',
                });
              }}
            >
              <MenuItem value="">—</MenuItem>
              {defaults.contacts.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            {field('department', en ? 'Department' : 'Abteilung', {
              inputProps: { maxLength: 50 },
            })}
            {field(
              'customerReference',
              en ? 'Customer reference' : 'Kundenreferenz',
              { inputProps: { maxLength: 50 } },
            )}
            {field('title', en ? 'Offer title' : 'Angebotstitel', {
              inputProps: { maxLength: 100 },
            })}
            {field('inquiryDate', en ? 'Inquiry date' : 'Anfrage vom', {
              type: 'date',
              InputLabelProps: { shrink: true },
            })}
            {field('inquiryVia', en ? 'Inquiry via' : 'Anfrage per', {
              inputProps: { maxLength: 15 },
            })}
            {field('validUntil', en ? 'Valid until' : 'Gültig bis', {
              type: 'date',
              InputLabelProps: { shrink: true },
            })}
          </Box>
        </CardContent>
      </Card>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
        <Tab label={en ? 'Positions' : 'Positionen'} />
        <Tab label={en ? 'Basic data' : 'Basisdaten'} />
        <Tab label={en ? 'Internal note' : 'Interne Bemerkung'} />
      </Tabs>
      <Box sx={{ display: tab === 0 ? 'grid' : 'none', gap: 1 }}>
        <Button
          variant="outlined"
          onClick={() => setArticleOpen(true)}
          disabled={saving || !form.customerId}
        >
          {en ? 'Add active BMS articles' : 'Aktive BMS-Artikel hinzufügen'}
        </Button>
        {form.positions.map((p, i) => (
          <OfferPositionEditor
            key={p.lineKey}
            position={p}
            index={i}
            en={en}
            currency={form.currency}
            onChange={(values) =>
              patch({
                positions: form.positions.map((x, j) =>
                  j === i ? { ...x, ...values } : x,
                ),
              })
            }
            onRemove={() =>
              patch({ positions: form.positions.filter((_, j) => j !== i) })
            }
            onDuplicate={() =>
              patch({
                positions: form.positions.flatMap((x, j) =>
                  j === i
                    ? [
                        x,
                        {
                          ...x,
                          lineKey: createCustomerOperationId(),
                          id: undefined,
                          reserve: false,
                          reservationVersion: null,
                          beNumber: null,
                          warehouseId: null,
                          reserveQuantity: null,
                          reserveUntil: null,
                        },
                      ]
                    : [x],
                ),
              })
            }
          />
        ))}
      </Box>
      <Card sx={{ display: tab === 1 ? 'block' : 'none' }}>
        <CardContent sx={{ display: 'grid', gap: 1 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 1,
            }}
          >
            {field('currency', en ? 'Currency' : 'Währung', {
              inputProps: { maxLength: 3 },
            })}
            <TextField
              select
              size="small"
              label={en ? 'Payment terms' : 'Zahlungsbedingungen'}
              value={form.paymentId || ''}
              onChange={(e) => {
                const p = defaults.payments.find(
                  (p) => Number(p.id) === Number(e.target.value),
                );
                patch({ paymentId: p?.id || null, paymentText: p?.text || '' });
              }}
            >
              <MenuItem value="">—</MenuItem>
              {defaults.payments.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.text}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          {field('paymentText', en ? 'Payment text' : 'Zahlungstext', {
            multiline: true,
          })}
          {field('deliveryTerms', en ? 'Delivery terms' : 'Lieferbedingungen', {
            inputProps: { maxLength: 250 },
          })}
          {field('packaging', en ? 'Packaging' : 'Verpackung', {
            inputProps: { maxLength: 100 },
          })}
          {field('intro', en ? 'Introduction' : 'Einleitungstext', {
            multiline: true,
            minRows: 2,
          })}
          {field('closingText', en ? 'Closing text' : 'Schlusstext', {
            multiline: true,
            minRows: 2,
          })}
        </CardContent>
      </Card>
      <Box sx={{ display: tab === 2 ? 'block' : 'none' }}>
        {field('internalNote', en ? 'Internal note' : 'Interne Bemerkung', {
          fullWidth: true,
          multiline: true,
          minRows: 4,
        })}
      </Box>
      <Card>
        <CardContent sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {field('discountPercent', en ? 'Discount %' : 'Rabatt %', {
              type: 'number',
              inputProps: { min: 0, max: 100, step: 0.001 },
            })}
            {field('vatPercent', en ? 'VAT %' : 'MwSt. %', {
              type: 'number',
              inputProps: { min: 0, max: 100, step: 0.001 },
            })}
          </Box>
          {[
            ['netAmount', en ? 'Net' : 'Nettosumme'],
            ['discountAmount', en ? 'Discount' : 'Rabattbetrag'],
            ['subtotal', en ? 'Subtotal' : 'Zwischensumme'],
            ['vatAmount', en ? 'VAT' : 'MwSt.-Betrag'],
            ['totalAmount', en ? 'Total' : 'Gesamtsumme'],
          ].map(([key, label]) => (
            <Box
              key={key}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
            >
              <Typography fontWeight={key === 'totalAmount' ? 700 : 400}>
                {label}
              </Typography>
              <Typography fontWeight={key === 'totalAmount' ? 700 : 400}>
                {money(sums[key], form.currency)}
              </Typography>
            </Box>
          ))}
          <FormControlLabel
            control={
              <Checkbox
                checked={form.printTotals}
                onChange={(e) => patch({ printTotals: e.target.checked })}
              />
            }
            label={en ? 'Print totals' : 'Summen ausdrucken'}
          />
        </CardContent>
      </Card>
      <Button
        type="submit"
        variant="contained"
        disabled={saving || !form.customerId || !form.positions.length}
      >
        {saving ? (
          <CircularProgress size={22} />
        ) : en ? (
          'Save offer'
        ) : (
          'Angebot speichern'
        )}
      </Button>
      <OfferCustomerPicker
        open={customerOpen}
        copy={Boolean(copyId)}
        onClose={() => setCustomerOpen(false)}
        onSelect={selectCustomer}
      />
      <OfferArticlePicker
        open={articleOpen}
        onClose={() => setArticleOpen(false)}
        onAdd={(articles) => {
          patch({
            positions: [...form.positions, ...articles.map(newOfferPosition)],
          });
          setArticleOpen(false);
        }}
      />
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
              try {
                sessionStorage.removeItem(draftKey);
              } catch {
                /* optional */
              }
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
        <DialogContent>
          {en
            ? 'A draft from this session is available.'
            : 'Für diesen Vorgang liegt ein Entwurf aus dieser Sitzung vor.'}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              try {
                sessionStorage.removeItem(draftKey);
              } catch {
                /* optional */
              }
              setDraft(null);
              if (!form.customerId) setCustomerOpen(true);
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
                  setDefaults(
                    (
                      await apiRequest(
                        `/temp-offers/customer-defaults/${encodeURIComponent(draft.customerId)}?language=${draft.language}`,
                      )
                    ).data,
                  );
                } catch (e) {
                  setError(e.message);
                }
              } else setCustomerOpen(true);
            }}
          >
            {en ? 'Restore' : 'Wiederherstellen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

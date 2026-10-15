import React from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { submitContact } from '../utils/contactSubmission.js';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';
import { CREATION_LABELS, CREATION_LISTS, CONTACT_FIELDS, createEmptyContact, createEmptyAddress, getCreationFieldLimit, setCreationValue, getCreationValue } from '../utils/customerCreation.js';
import { contactStorageKey, readContactPending, contactDraft, validateContactDraft, contactFailureDetails, contactProblemFields } from '../utils/contactCreation.js';

const message = (entry) => typeof entry === 'string' ? entry : entry?.nachricht || entry?.detail || entry?.code || '';

export default function ContactCreateDialog({ customerId, customerName, mandant, rankings, onClose, onCreated, onExisting }) {
  const { lang, t } = useI18n();
  const languageIndex = lang === 'en' ? 1 : 0;
  const tr = (de, en) => lang === 'en' ? en : de;
  const [context, setContext] = React.useState(null);
  const [draft, setDraft] = React.useState(createEmptyContact);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [errors, setErrors] = React.useState({});
  const [preflight, setPreflight] = React.useState(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [warningsAccepted, setWarningsAccepted] = React.useState(false);
  const [frozen, setFrozen] = React.useState(null);
  const active = React.useRef(false);
  const busyRef = React.useRef(false);
  const base = `/customers/${encodeURIComponent(customerId)}/contacts`;
  const isCurrent = () => active.current && getMandant() === mandant;
  const storageKey = context ? contactStorageKey(context.userId, context.mandant, customerId) : '';

  React.useEffect(() => {
    active.current = true;
    apiRequest(`${base}/context`).then(({ data }) => {
      if (!isCurrent()) return;
      setContext(data);
      const pending = readContactPending(sessionStorage, contactStorageKey(data.userId, data.mandant, customerId)) || data.pending;
      if (pending) {
        setFrozen(pending); setDraft(contactDraft(pending.body.contact));
        setConfirmed(pending.body.confirmed === true); setReason(pending.body.reason || '');
        setWarningsAccepted(pending.body.warningsAccepted === true);
      }
    }).catch((failure) => { if (isCurrent()) setError(failure.message); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { active.current = false; };
  }, [customerId, mandant]);

  const update = (path, value) => {
    setDraft((previous) => setCreationValue(previous, path, value));
    setErrors({}); setError(''); setPreflight(null); setConfirmed(false); setReason(''); setWarningsAccepted(false);
  };
  const applyProblem = (problem) => {
    setErrors(contactProblemFields(problem));
    if (problem?.ergebnis || problem?.vorhanden) setPreflight(problem);
  };
  const clearPending = () => {
    try { sessionStorage.removeItem(storageKey); } catch { /* A stale created key remains safe to replay. */ }
    setFrozen(null);
  };
  const complete = async (data) => {
    await onCreated(data.contact.id, data.warnings || []);
    if (!isCurrent()) return;
    clearPending(); onClose();
  };
  const run = async (send) => {
    if (busyRef.current || !isCurrent() || !context) return;
    const localErrors = frozen ? {} : validateContactDraft(draft, confirmed, reason);
    setErrors(localErrors);
    if (Object.keys(localErrors).length) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await submitContact({ base, pending: frozen, body: { contact: draft, confirmed, reason, warningsAccepted },
        send, writeEnabled: context.writeEnabled, storage: sessionStorage, storageKey, lang }, {
        request: apiRequest, isCurrent, onFrozen: setFrozen, onCreated: complete,
        onPreflight: (checked) => { setPreflight(checked); setErrors(contactProblemFields(checked)); },
        onFailed: (problem) => { clearPending(); applyProblem(problem); setError(problem?.detail || 'Die Anlage wurde abgewiesen. Bitte die Eingaben prüfen.'); },
      });
    } catch (failure) {
      if (!isCurrent()) return;
      const details = contactFailureDetails(failure);
      if (details.state === 'failed') clearPending();
      applyProblem(details.problem); setError(failure.message || 'Die Aktion konnte nicht abgeschlossen werden.');
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  };
  const openExisting = async (id) => {
    if (busyRef.current || !isCurrent()) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await onExisting(id); if (isCurrent()) onClose(); }
    catch (failure) { if (isCurrent()) setError(failure.message); }
    finally { busyRef.current = false; if (isCurrent()) setBusy(false); }
  };
  const disabled = busy || Boolean(frozen);
  const field = (path, required = false) => {
    const key = path.split('.').at(-1);
    const entries = context?.lists?.[CREATION_LISTS[key]]?.eintraege;
    const options = key === 'ranking' ? rankings.map((rank) => ({ schluessel: rank, bezeichnung: String(rank) })) : entries;
    return <TextField key={path} size="small" fullWidth label={CREATION_LABELS[key]?.[languageIndex] || key}
      required={required} disabled={disabled} value={getCreationValue(draft, path) ?? ''}
      select={Boolean(options)} type={key === 'geburtstag' ? 'date' : key === 'email' ? 'email' : 'text'}
      InputLabelProps={key === 'geburtstag' ? { shrink: true } : undefined}
      multiline={key === 'notiz'} minRows={key === 'notiz' ? 2 : undefined}
      inputProps={{ maxLength: getCreationFieldLimit(`ansprechpartner.${path}`) }}
      error={Boolean(errors[path])} helperText={errors[path] || ''} onChange={(event) => update(path, event.target.value)}>
      {options && <MenuItem value="">{tr("Keine Vorgabe / leer","Default / empty")}</MenuItem>}
      {options?.map((entry) => <MenuItem key={entry.schluessel} value={entry.schluessel}>{entry.bezeichnung || entry.schluessel}</MenuItem>)}
    </TextField>;
  };
  const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 };
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="create-contact-title">
    <DialogTitle id="create-contact-title">{t('contact_create')}</DialogTitle>
    <DialogContent dividers>
      <Typography color="text.secondary">{customerName} · {customerId} · {context?.mandant || mandant}</Typography>
      {loading && <CircularProgress size={24} sx={{ mt: 2 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {context && <>
        {!context.writeEnabled && <Alert severity="info" sx={{ mt: 2 }}>{tr("Das Anlegen über die ERP-API ist gesperrt. Eine Vorprüfung ist möglich.","Creation through the ERP API is disabled. A preflight check is available.")}</Alert>}
        {frozen && <Alert severity="warning" sx={{ mt: 2 }}>{tr("Dieser Vorgang kann bereits angelegt sein. Bitte denselben Vorgang wiederholen. Die Eingaben bleiben gesperrt.","This contact may already exist. Please retry the same operation. The fields remain locked.")}<Typography variant="caption" display="block">{tr('Vorgangs-ID: ', 'Operation ID: ')}{frozen.id}</Typography></Alert>}
        <Box sx={grid}>{CONTACT_FIELDS.map((key) => field(key, key === 'name'))}</Box>
        <FormControlLabel label={tr("Eigene Anschrift","Separate address")} control={<Checkbox disabled={disabled} checked={Boolean(draft.eigeneAnschrift)} onChange={(event) => update('eigeneAnschrift', event.target.checked ? createEmptyAddress() : null)} />} />
        {draft.eigeneAnschrift && <Box sx={grid}>{['strasse', 'plz', 'ort', 'land'].map((key) => field(`eigeneAnschrift.${key}`, true))}</Box>}
        {preflight?.ergebnis === 'anlegbar' && <Alert severity="success" sx={{ mt: 2 }}>{tr("Vorprüfung erfolgreich. Es wurde noch kein Ansprechpartner angelegt.","Preflight check passed. No contact has been created yet.")}</Alert>}
        {preflight?.ergebnis === 'ungueltig' && <Alert severity="error" sx={{ mt: 2 }}>{tr("Bitte die Eingaben prüfen.","Please check the details.")}</Alert>}
        {preflight?.fehler?.map((entry, index) => <Alert key={index} severity="error" sx={{ mt: 1 }}>{message(entry)}</Alert>)}
        {preflight?.vorhanden?.length > 0 && <Box sx={{ mt: 2 }}>
          <Typography fontWeight={600}>{tr("Mögliche Dubletten","Possible duplicates")}</Typography>
          {preflight.vorhanden.map((entry) => <Stack key={`${entry.mandant}-${entry.lfdNr}`} direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
            <Typography sx={{ flex: 1 }}>{[entry.vorname, entry.name].filter(Boolean).join(' ')} · {entry.email || entry.telefon || ''} · {entry.mandant}</Typography>
            {entry.mandant === context.mandant && entry.lfdNr > 0 && <Button disabled={disabled} onClick={() => openExisting(entry.lfdNr)}>{tr("Öffnen","Open")}</Button>}
          </Stack>)}
          {preflight.uebersteuerbar && <>
            <FormControlLabel label={tr("Dies ist eine andere Person","This is a different person")} control={<Checkbox checked={confirmed} disabled={disabled} onChange={(event) => { setConfirmed(event.target.checked); setWarningsAccepted(false); }} />} />
            {confirmed && <TextField label={tr("Begründung (10 bis 500 Zeichen)","Reason (10 to 500 characters)")} value={reason} disabled={disabled} fullWidth multiline minRows={2} inputProps={{ maxLength: 500 }} error={Boolean(errors.reason)} helperText={errors.reason} onChange={(event) => setReason(event.target.value)} />}
          </>}
        </Box>}
        {preflight?.warnungen?.length > 0 && <Alert severity="warning" sx={{ mt: 2 }}>
          {preflight.warnungen.map((entry, index) => <Typography key={index}>{message(entry)}</Typography>)}
          <FormControlLabel label={tr("Ich habe die Hinweise geprüft.","I have reviewed the warnings.")} control={<Checkbox checked={warningsAccepted} disabled={disabled} onChange={(event) => setWarningsAccepted(event.target.checked)} />} />
        </Alert>}
      </>}
    </DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
      {busy && <CircularProgress size={20} />}
      <Button disabled={busy} onClick={onClose}>{tr("Schließen","Close")}</Button>
      {context && !frozen && <Button disabled={busy} onClick={() => run(false)}>{tr("Eingaben prüfen","Check details")}</Button>}
      {context && <Button variant="contained" disabled={busy || (!frozen && !context.writeEnabled)} onClick={() => run(true)}>{frozen ? tr('Denselben Vorgang wiederholen', 'Retry the same operation') : t('contact_create')}</Button>}
    </DialogActions>
  </Dialog>;
}

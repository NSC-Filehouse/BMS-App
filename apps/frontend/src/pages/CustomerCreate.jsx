import React from 'react';
import { Alert, Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Checkbox, CircularProgress, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getMandant } from '../utils/mandant.js';
import { navigateToReturn } from '../utils/navigation.js';
import { CREATION_LABELS, CREATION_LISTS, createCustomerDraft, createCustomerOperationId, createEmptyAddress, createEmptyContact, buildCustomerCreationBody, validateCustomerDraft, getCreationFieldLimit, setCreationValue, getCreationValue } from '../utils/customerCreation.js';

const TEXT = {
  de: {
    title: 'Kunde anlegen', company: 'Firma / Person und Hauptanschrift', contact: 'Kontakt zur Firma', tax: 'Steuerdaten', invoice: 'Rechnungsanschrift und Rechnungsversand', sales: 'Vertrieb', payment: 'Zahlung und Bank', more: 'Zuordnung und weitere Angaben', people: 'Ansprechpartner', delivery: 'Lieferanschriften', postbox: 'Postfach',
    private: 'Privatperson', privateHelp: 'Privatpersonen dürfen ohne USt-ID angelegt werden.', thirdCountry: 'Dieses Land gehört nicht zur EU. Eine USt-ID ist optional.', vatRequired: 'Bei Firmen aus EU-Ländern ist die USt-ID Pflicht.',
    invoiceSame: 'Rechnungsanschrift entspricht der Hauptanschrift', invoiceEmail: 'Rechnungs-E-Mail', invoiceHelp: 'Wird für die spätere Auftragsübergabe benötigt.', bankEnabled: 'Bankverbindung angeben', postboxEnabled: 'Postfach angeben', ownAddress: 'Eigene Anschrift', moreVat: 'Weitere USt-IDs', add: 'Hinzufügen', remove: 'Entfernen',
    discard: 'Verwerfen', check: 'Eingaben prüfen', send: 'An BMS senden', retry: 'Denselben Vorgang wiederholen', back: 'Zur Kundenübersicht', openCustomer: 'Kunde öffnen', required: 'Bitte dieses Pflichtfeld ausfüllen.', empty: 'Keine Vorgabe / leer',
    test: 'Echte Kundenanlagen sind noch gesperrt. Du kannst das Formular und die schreibfreie Vorprüfung testen.', target: 'Zentrale Anlage', copy: 'Kopie nach', noCopy: 'Keine zusätzliche Kopie erforderlich.', checking: 'Eingaben werden geprüft …', sending: 'Kunde wird angelegt …',
    checkOk: 'Die Vorprüfung ist erfolgreich. Es wurde noch kein Kunde angelegt.', incomplete: 'Bitte die markierten Angaben ergänzen oder korrigieren.', warnings: 'Warnungen', warningsAccept: 'Ich habe die Warnungen geprüft.', warningReview: 'Bitte die Warnungen prüfen und anschließend erneut senden.',
    duplicates: 'Mögliche Dubletten', noOverride: 'Diese Dublette lässt sich nicht übersteuern. Bitte den vorhandenen Kunden verwenden.', distinct: 'Dies ist eine andere Firma / Person', reason: 'Begründung (mindestens 10 Zeichen)', hints: 'Weitere Hinweise', existing: 'Vorhanden', entered: 'Eingabe',
    created: 'Kunde erfolgreich angelegt', partial: 'Kunde zentral angelegt; mindestens eine Kopie ist fehlgeschlagen. Die zentrale Anlage nicht erneut auslösen.', number: 'Kundennummer', unknown: 'Ergebnis unklar. Der Kunde kann bereits angelegt sein. Die Eingaben bleiben gesperrt; wiederhole ausschließlich denselben Vorgang.',
    history: 'Anlagehistorie dieses Mandanten', noHistory: 'Noch keine Anlagevorgänge.', refresh: 'Aktualisieren', error: 'Die Aktion konnte nicht abgeschlossen werden.', loadError: 'Die Kundenanlage konnte nicht geladen werden.', successStatus: 'angelegt', alreadyStatus: 'bereits vorhanden', failedStatus: 'fehlgeschlagen', status: 'Status',
    automatic: 'Wird automatisch aus dem angemeldeten Benutzer gesetzt.', defaults: 'Matchcode und nicht angegebene optionale Werte ergänzt die BMS.', key: 'Vorgangs-ID', row: 'Eintrag',
  },
  en: {
    title: 'Create customer', company: 'Company / person and main address', contact: 'Company contact', tax: 'Tax details', invoice: 'Invoice address and delivery', sales: 'Sales', payment: 'Payment and bank', more: 'Classification and further details', people: 'Contacts', delivery: 'Delivery addresses', postbox: 'PO box',
    private: 'Private individual', privateHelp: 'Private individuals may be created without a VAT ID.', thirdCountry: 'This country is outside the EU. A VAT ID is optional.', vatRequired: 'EU companies must provide a VAT ID.',
    invoiceSame: 'Invoice address is the same as the main address', invoiceEmail: 'Invoice email', invoiceHelp: 'Required for subsequent order submission.', bankEnabled: 'Enter bank details', postboxEnabled: 'Enter PO box', ownAddress: 'Separate address', moreVat: 'Additional VAT IDs', add: 'Add', remove: 'Remove',
    discard: 'Discard', check: 'Check details', send: 'Send to BMS', retry: 'Retry the same operation', back: 'Back to customers', openCustomer: 'Open customer', required: 'Please fill in this required field.', empty: 'Default / empty',
    test: 'Customer creation is currently disabled. You can test the form and the read-only preflight check.', target: 'Central creation', copy: 'Copy to', noCopy: 'No additional copy required.', checking: 'Checking details …', sending: 'Creating customer …',
    checkOk: 'The preflight check succeeded. No customer has been created yet.', incomplete: 'Please complete or correct the highlighted details.', warnings: 'Warnings', warningsAccept: 'I have reviewed the warnings.', warningReview: 'Please review the warnings and submit again.',
    duplicates: 'Possible duplicates', noOverride: 'This duplicate cannot be overridden. Please use the existing customer.', distinct: 'This is a different company / person', reason: 'Reason (at least 10 characters)', hints: 'Further information', existing: 'Existing', entered: 'Entered',
    created: 'Customer created successfully', partial: 'Customer created centrally; at least one copy failed. Do not create the central customer again.', number: 'Customer number', unknown: 'Outcome unknown. The customer may already exist. Fields remain locked; retry only the same operation.',
    history: 'Creation history for this tenant', noHistory: 'No creation operations yet.', refresh: 'Refresh', error: 'The action could not be completed.', loadError: 'Customer creation could not be loaded.', successStatus: 'created', alreadyStatus: 'already exists', failedStatus: 'failed', status: 'Status',
    automatic: 'Automatically assigned to the signed-in user.', defaults: 'BMS supplies the match code and omitted optional defaults.', key: 'Operation ID', row: 'Entry',
  },
};
const fieldId = (path) => `create-customer-${path.replace(/[^a-zA-Z0-9]/g, '-')}`;

export default function CustomerCreate() {
  const { lang } = useI18n();
  const w = TEXT[lang === 'en' ? 'en' : 'de'];
  const languageIndex = lang === 'en' ? 1 : 0;
  const navigate = useNavigate();
  const location = useLocation();
  const mandant = getMandant();
  const [context, setContext] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const [errors, setErrors] = React.useState({});
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [preflight, setPreflight] = React.useState(null);
  const [warningsAccepted, setWarningsAccepted] = React.useState(false);
  const [confirmations, setConfirmations] = React.useState({});
  const [expanded, setExpanded] = React.useState({ company: true, invoice: true, sales: true });
  const [frozen, setFrozen] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [historyRows, setHistoryRows] = React.useState(null);
  const [historyError, setHistoryError] = React.useState('');
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const operationRef = React.useRef(null);
  if (!operationRef.current) operationRef.current = createCustomerOperationId();
  const checkedRef = React.useRef(null);
  const storageKey = context ? `bms.customerCreation.pending.${encodeURIComponent(mandant)}.${context.ownUserId}` : '';
  const back = () => navigateToReturn(navigate, location.state?.returnTo, '/customers');

  React.useEffect(() => {
    let alive = true;
    apiRequest('/customer-creation/context').then(async (response) => {
      if (!alive) return;
      const ctx = response.data;
      setContext(ctx);
      setDraft(createCustomerDraft(ctx));
      const key = `bms.customerCreation.pending.${encodeURIComponent(mandant)}.${ctx.ownUserId}`;
      let pending;
      try { pending = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { pending = null; }
      if (pending?.id && pending?.body && pending?.draft) {
        setDraft(pending.draft);
        setFrozen(pending);
        operationRef.current = pending.id;
        try {
          const status = await apiRequest(`/customer-creation/operations/${encodeURIComponent(pending.id)}`);
          if (!alive) return;
          if (['created', 'partial'].includes(status.data?.state)) {
            setResult({ data: status.data.response, meta: { state: status.data.state } });
            setFrozen(null);
            sessionStorage.removeItem(key);
          } else if (status.data?.state === 'failed') {
            setFrozen(null);
            sessionStorage.removeItem(key);
            operationRef.current = createCustomerOperationId();
            setError(status.data.response?.detail || status.data.response?.title || w.error);
          }
        } catch { /* An uncertain operation keeps its original payload and key. */ }
      }
    }).catch((failure) => { if (alive) setError(failure?.message || w.loadError); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [mandant]);

  const update = (path, value) => {
    setDraft((previous) => setCreationValue(previous, path, value));
    setErrors({}); setError(''); setNotice(''); setPreflight(null); setConfirmations({}); setWarningsAccepted(false); checkedRef.current = null;
  };
  const focusErrors = (values) => {
    if (draft?.invoiceSame) {
      values = Object.fromEntries(Object.entries(values).map(([path, message]) => {
        if (!path.startsWith('rechnungsanschrift.')) return [path, message];
        const key = path.slice('rechnungsanschrift.'.length);
        if (['strasse', 'plz', 'ort', 'land'].includes(key)) return [`stammdaten.anschrift.${key}`, message];
        if (['name1', 'name2', 'anrede'].includes(key)) return [`stammdaten.${key}`, message];
        return [path, message];
      }));
    }
    setErrors(values);
    setExpanded({ company: true, contact: true, tax: true, invoice: true, sales: true, payment: true, more: true, people: true, delivery: true, postbox: true });
    setTimeout(() => {
      const element = document.getElementById(fieldId(Object.keys(values)[0] || ''));
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); element?.focus();
    }, 50);
  };
  const handleFailure = (failure) => {
    const details = failure.payload?.error?.details || {};
    const problem = details.problem || details;
    const values = {};
    for (const entry of problem.fehler || []) if (entry.feld) values[entry.feld] = entry.abhilfe || entry.nachricht;
    if (Object.keys(values).length) focusErrors(values);
    if (problem.dubletten) setPreflight({ ...problem, ergebnis: 'dubletten' });
    setError(failure.message || w.error);
  };
  const run = async (send) => {
    if (busyRef.current) return;
    const localErrors = frozen ? {} : validateCustomerDraft(draft, context);
    if (Object.keys(localErrors).length) { focusErrors(localErrors); setError(w.incomplete); return; }
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    let pending = frozen;
    try {
      const confirmationList = Object.entries(confirmations).filter(([, entry]) => entry.confirmed && entry.reason?.trim().length >= 10)
        .map(([kundennummer, entry]) => ({ kundennummer, begruendung: entry.reason.trim() }));
      const body = pending?.body || buildCustomerCreationBody(draft, confirmationList);
      const id = pending?.id || operationRef.current;
      const signature = JSON.stringify(body);
      if (!pending) {
        let checked = checkedRef.current?.signature === signature ? checkedRef.current.data : null;
        if (!checked || !send) {
          checked = (await apiRequest('/customer-creation/check', { method: 'POST', headers: { 'Idempotency-Key': id }, body: JSON.stringify(body) })).data;
          setPreflight(checked); checkedRef.current = { signature, data: checked };
        }
        if (checked.ergebnis !== 'anlegbar') {
          const values = {};
          for (const entry of checked.fehler || []) if (entry.feld) values[entry.feld] = entry.abhilfe || entry.nachricht;
          if (Object.keys(values).length) focusErrors(values);
          if (checked.fehler?.length) setError(checked.fehler.map((entry) => entry.nachricht || entry.code).join(' '));
          return;
        }
        if (!send || !context.writeEnabled) { setNotice(w.checkOk); return; }
        if (checked.warnungen?.length && !warningsAccepted) { setNotice(w.warningReview); return; }
        pending = { id, body, draft };
        // Persist the exact request before sending, so reloads and timeouts cannot create a new operation.
        sessionStorage.setItem(storageKey, JSON.stringify(pending));
        setFrozen(pending);
      }
      const response = await apiRequest('/customer-creation', { method: 'POST', headers: { 'Idempotency-Key': pending.id }, body: JSON.stringify(pending.body) });
      setResult(response); setFrozen(null); sessionStorage.removeItem(storageKey);
    } catch (failure) {
      const state = failure.payload?.error?.details?.state;
      const uncertain = state === 'unknown' || failure.code === 'CUSTOMER_CREATION_RUNNING'
        || failure.code === 'CUSTOMER_CREATION_HISTORY_UNCERTAIN' || failure.code === 'CUSTOMER_CREATION_KEY_REUSED'
        || failure.code === 'IDEMPOTENZ.SCHLUESSEL_WIEDERVERWENDET'
        || (!state && (failure.status >= 500 || !failure.status || failure.code === 'AUTH_REQUIRED'));
      if (pending && uncertain) setFrozen(pending);
      else if (pending) {
        setFrozen(null); sessionStorage.removeItem(storageKey); operationRef.current = createCustomerOperationId(); checkedRef.current = null;
      }
      handleFailure(failure);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const loadHistory = async () => {
    if (historyLoading) return;
    setHistoryLoading(true); setHistoryError('');
    try { setHistoryRows((await apiRequest('/customer-creation/history')).data || []); }
    catch (failure) { setHistoryError(failure.message); }
    finally { setHistoryLoading(false); }
  };
  const field = (path, options = {}) => {
    const key = path.split('.').at(-1);
    const listName = options.list || CREATION_LISTS[key];
    let entries = context.lists[listName]?.eintraege || [];
    if (listName === 'kategorien') entries = entries.filter((entry) => !entry.lieferant);
    const isSelect = Boolean(listName) || key === 'ranking';
    const value = getCreationValue(draft, path) ?? (options.multiple ? [] : '');
    const label = options.label || CREATION_LABELS[key]?.[languageIndex] || key;
    const fieldError = errors[path];
    return <TextField key={path} id={fieldId(path)} name={path} label={label} value={value}
      required={Boolean(options.required)} fullWidth size="small" select={isSelect} disabled={busy || Boolean(frozen) || options.readOnly}
      type={key === 'geburtstag' ? 'date' : key.toLowerCase().includes('email') ? 'email' : ['telefon', 'mobil', 'fax'].includes(key) ? 'tel' : 'text'}
      multiline={['notiz', 'info'].includes(key)} minRows={['notiz', 'info'].includes(key) ? 2 : undefined}
      InputLabelProps={key === 'geburtstag' ? { shrink: true } : undefined}
      inputProps={{ maxLength: getCreationFieldLimit(path) }}
      SelectProps={options.multiple ? { multiple: true } : undefined}
      error={Boolean(fieldError)} helperText={fieldError === 'required' ? w.required : fieldError || options.help}
      onChange={(event) => update(path, event.target.value)}>
      {isSelect && !options.multiple && <MenuItem value="">{w.empty}</MenuItem>}
      {key === 'ranking' ? [1, 2, 3].map((rank) => <MenuItem key={rank} value={rank}>{rank}</MenuItem>)
        : entries.map((entry) => <MenuItem key={entry.schluessel} value={entry.schluessel}>{entry.bezeichnung}{listName === 'mitarbeiter' ? ` (${entry.schluessel})` : ''}</MenuItem>)}
    </TextField>;
  };
  const grid = (...children) => <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: 2, mt: 1 }}>{children}</Box>;
  const fields = (prefix, keys, required = []) => keys.map((key) => field(`${prefix}.${key}`, { required: required.includes(key) }));
  const toggle = (path, label, valueWhenEnabled = true) => <FormControlLabel key={path} label={label}
    control={<Checkbox checked={Boolean(getCreationValue(draft, path))} disabled={busy || Boolean(frozen)} onChange={(event) => update(path, event.target.checked ? valueWhenEnabled : typeof valueWhenEnabled === 'boolean' ? false : null)} />} />;
  const section = (key, title, children) => <Accordion key={key} expanded={Boolean(expanded[key])} onChange={(_, open) => setExpanded((previous) => ({ ...previous, [key]: open }))} disableGutters>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>{title}</Typography></AccordionSummary>
    <AccordionDetails>{children}</AccordionDetails>
  </Accordion>;
  const remove = (path, index) => <IconButton aria-label={w.remove} disabled={busy || Boolean(frozen)} onClick={() => update(path, getCreationValue(draft, path).filter((_, itemIndex) => itemIndex !== index))}><DeleteOutlineIcon /></IconButton>;
  const add = (path, value) => <Button startIcon={<AddIcon />} disabled={busy || Boolean(frozen)} onClick={() => update(path, [...getCreationValue(draft, path), value])}>{w.add}</Button>;
  const messages = (entries) => (entries || []).map((entry, index) => <Typography key={`${entry.code}-${index}`} variant="body2" sx={{ mb: 1 }}>{entry.nachricht || entry.code}{entry.abhilfe ? ` ${entry.abhilfe}` : ''}</Typography>);

  if (loading) return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>;
  if (!context || !draft) return <Stack spacing={2}><Alert severity="error">{error || w.loadError}</Alert><Button onClick={back}>{w.back}</Button></Stack>;
  const country = context.lists.laender.eintraege.find((entry) => entry.schluessel === draft.stammdaten.anschrift.land);
  const copied = context.targetMandant === context.stammMandant || result?.data?.kopien?.some((entry) => entry.mandant === context.targetMandant && ['angelegt', 'bereitsVorhanden'].includes(entry.status));
  return <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', pb: 2 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><IconButton aria-label={w.back} disabled={busy} onClick={back}><ArrowBackIcon /></IconButton><Typography variant="h5">{w.title}</Typography></Stack>
    {result ? <Stack spacing={2}>
      <Alert severity={result.meta?.state === 'partial' ? 'warning' : 'success'}>{result.meta?.state === 'partial' ? w.partial : w.created}</Alert>
      <Card><CardContent><Typography variant="h6">{result.data.uebernommen?.name1}</Typography><Typography>{w.number}: <b>{result.data.kundennummer}</b></Typography><Typography>{w.target}: {result.data.mandant}</Typography>
        {(result.data.kopien || []).map((entry) => <Typography key={entry.mandant}>{w.copy} {entry.mandant}: {entry.status === 'angelegt' ? w.successStatus : entry.status === 'bereitsVorhanden' ? w.alreadyStatus : w.failedStatus}{entry.nachricht ? ` – ${entry.nachricht}` : ''}{entry.uebersprungeneKategorien?.length ? ` (${w.kategorien || CREATION_LABELS.kategorien[languageIndex]}: ${entry.uebersprungeneKategorien.join(', ')})` : ''}</Typography>)}
        <Typography variant="body2" sx={{ mt: 1 }}>{w.key}: {result.data.vorgangId}</Typography>
      </CardContent></Card>
      {messages(result.data.warnungen)}
      <Stack direction="row" spacing={1}><Button variant="contained" onClick={back}>{w.back}</Button>{copied && <Button onClick={() => navigate(`/customers/${encodeURIComponent(result.data.kundennummer)}`, { state: { returnTo: location.state?.returnTo } })}>{w.openCustomer}</Button>}</Stack>
    </Stack> : <>
      <Alert severity="info" sx={{ mb: 2 }}>{w.target}: <b>{context.stammMandant}</b>. {context.targetMandant === context.stammMandant ? w.noCopy : `${w.copy}: ${context.targetMandant}.`}</Alert>
      {!context.writeEnabled && <Alert severity="info" sx={{ mb: 2 }}>{w.test}</Alert>}
      {frozen && <Alert severity="warning" sx={{ mb: 2 }}>{w.unknown} {w.key}: {frozen.id}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="info" sx={{ mb: 2 }}>{notice}</Alert>}
      {section('company', w.company, <>
        {toggle('privatePerson', w.private)}
        {grid(...fields('stammdaten', ['name1', 'name2', 'matchcode', 'anrede', 'sprache'], ['name1']))}
        <Typography variant="body2" sx={{ my: 1, color: 'text.secondary' }}>{w.defaults}</Typography>
        {grid(...fields('stammdaten.anschrift', ['strasse', 'plz', 'ort', 'land', 'region'], ['strasse', 'plz', 'ort', 'land']))}
      </>)}
      {section('contact', w.contact, grid(...fields('stammdaten.kontakt', ['telefon', 'fax', 'email', 'homepage'])))}
      {section('tax', w.tax, <>
        <Typography variant="body2" sx={{ mb: 2 }}>{draft.privatePerson ? w.privateHelp : country?.euLand === false ? w.thirdCountry : w.vatRequired}</Typography>
        {field('stammdaten.steuer.ustIdNr', { required: !draft.privatePerson && country?.euLand !== false })}
        <Typography variant="subtitle2" sx={{ mt: 2 }}>{w.moreVat}</Typography>
        {draft.stammdaten.steuer.weitereUstIdNrn.map((_, index) => <Box key={index} sx={{ mb: 2 }}>{grid(...fields(`stammdaten.steuer.weitereUstIdNrn[${index}]`, ['land', 'ustIdNr'], ['land', 'ustIdNr']), remove('stammdaten.steuer.weitereUstIdNrn', index))}</Box>)}
        {add('stammdaten.steuer.weitereUstIdNrn', { land: 'DE', ustIdNr: '' })}
      </>)}
      {section('invoice', w.invoice, <>
        {toggle('invoiceSame', w.invoiceSame)}
        {!draft.invoiceSame && grid(...fields('rechnungsanschrift', ['anrede', 'name1', 'name2', 'abteilung', 'strasse', 'plz', 'ort', 'land'], ['name1', 'strasse', 'plz', 'ort', 'land']))}
        {grid(field('rechnungsanschrift.email', { label: w.invoiceEmail, required: true, help: w.invoiceHelp }), field('rechnungsanschrift.emailMahnung'))}
      </>)}
      {section('sales', w.sales, grid(field('vertrieb.aussendienst', { required: true, readOnly: true, help: w.automatic }), ...fields('vertrieb', ['innendienst', 'verkaufsbuero'])))}
      {section('payment', w.payment, <>
        {field('zahlung.zahlungsbedingungId')}
        <Box>{toggle('zahlung.euro', CREATION_LABELS.euro[languageIndex])}{toggle('zahlung.bankeinzug', CREATION_LABELS.bankeinzug[languageIndex])}</Box>
        {toggle('bankEnabled', w.bankEnabled)}
        {draft.bankEnabled && grid(...fields('bank', ['iban', 'bic', 'bank', 'kontoinhaber', 'info']))}
      </>)}
      {section('postbox', w.postbox, <>
        {toggle('stammdaten.postfach', w.postboxEnabled, { postfach: '', plz: '', ort: '', standardanschrift: false })}
        {draft.stammdaten.postfach && <>{grid(...fields('stammdaten.postfach', ['postfach', 'plz', 'ort']))}{toggle('stammdaten.postfach.standardanschrift', CREATION_LABELS.standardanschrift[languageIndex])}</>}
      </>)}
      {section('more', w.more, <>
        {grid(field('branchen', { multiple: true }), field('kategorien', { multiple: true }), field('wunschnummer'), field('notiz'))}
        {toggle('kennzeichen.keinSerienbrief', CREATION_LABELS.keinSerienbrief[languageIndex])}
      </>)}
      {section('people', w.people, <>
        {draft.ansprechpartner.map((person, index) => <Card key={index} variant="outlined" sx={{ mb: 2 }}><CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography fontWeight={600}>{w.row} {index + 1}</Typography>{remove('ansprechpartner', index)}</Stack>
          {grid(...fields(`ansprechpartner[${index}]`, ['anrede', 'titel', 'vorname', 'name', 'abteilung', 'position', 'telefon', 'fax', 'mobil', 'email', 'sprache', 'ranking', 'notiz', 'geburtstag'], ['name']))}
          {toggle(`ansprechpartner[${index}].eigeneAnschrift`, w.ownAddress, createEmptyAddress())}
          {person.eigeneAnschrift && grid(...fields(`ansprechpartner[${index}].eigeneAnschrift`, ['strasse', 'plz', 'ort', 'land'], ['strasse', 'plz', 'ort', 'land']))}
        </CardContent></Card>)}
        {add('ansprechpartner', createEmptyContact())}
      </>)}
      {section('delivery', w.delivery, <>
        {draft.lieferanschriften.map((_, index) => <Card key={index} variant="outlined" sx={{ mb: 2 }}><CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography fontWeight={600}>{w.row} {index + 1}</Typography>{remove('lieferanschriften', index)}</Stack>
          {grid(...fields(`lieferanschriften[${index}]`, ['name1', 'name2', 'strasse', 'plz', 'ort', 'land', 'region'], ['strasse', 'plz', 'ort', 'land']))}
        </CardContent></Card>)}
        {add('lieferanschriften', createEmptyAddress({ name1: draft.stammdaten.name1, name2: '' }))}
      </>)}
      {preflight?.dubletten?.length > 0 && <Card sx={{ my: 2 }}><CardContent><Typography variant="h6" sx={{ mb: 2 }}>{w.duplicates}</Typography>
        {!preflight.uebersteuerbar && <Alert severity="warning" sx={{ mb: 2 }}>{w.noOverride}</Alert>}
        {preflight.dubletten.map((candidate) => <Box key={candidate.kundennummer} sx={{ mb: 3 }}>
          <Typography fontWeight={600}>{candidate.kundennummer} – {candidate.vergleich?.name1?.vorhanden || ''} ({(candidate.vorhandenIn || []).join(', ')})</Typography>
          {Object.entries(candidate.vergleich || {}).map(([key, comparison]) => <Typography key={key} variant="body2">{CREATION_LABELS[key]?.[languageIndex] || key}: {w.existing}: {String(comparison?.vorhanden ?? '–')} · {w.entered}: {String(comparison?.eingabe ?? '–')}</Typography>)}
          {preflight.uebersteuerbar && candidate.uebersteuerbar && <>
            <FormControlLabel label={w.distinct} control={<Checkbox checked={Boolean(confirmations[candidate.kundennummer]?.confirmed)} disabled={busy || Boolean(frozen)} onChange={(event) => {
              setConfirmations((previous) => ({ ...previous, [candidate.kundennummer]: { ...previous[candidate.kundennummer], confirmed: event.target.checked } })); checkedRef.current = null;
            }} />} />
            <TextField label={w.reason} fullWidth size="small" multiline minRows={2} value={confirmations[candidate.kundennummer]?.reason || ''} disabled={busy || Boolean(frozen)} inputProps={{ minLength: 10, maxLength: 500 }}
              onChange={(event) => { setConfirmations((previous) => ({ ...previous, [candidate.kundennummer]: { ...previous[candidate.kundennummer], reason: event.target.value } })); checkedRef.current = null; }} />
          </>}
        </Box>)}
      </CardContent></Card>}
      {preflight?.warnungen?.length > 0 && <Alert severity="warning" sx={{ my: 2 }}><Typography fontWeight={600}>{w.warnings}</Typography>{messages(preflight.warnungen)}<FormControlLabel label={w.warningsAccept} control={<Checkbox checked={warningsAccepted} onChange={(event) => setWarningsAccepted(event.target.checked)} disabled={busy || Boolean(frozen)} />} /></Alert>}
      {preflight?.hinweise?.length > 0 && <Alert severity="info" sx={{ my: 2 }}><Typography fontWeight={600}>{w.hints}</Typography>{preflight.hinweise.map((entry) => <Typography key={entry.kundennummer} variant="body2">{entry.kundennummer} – {entry.vergleich?.name1?.vorhanden || ''}</Typography>)}</Alert>}
      <Box sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', py: 2, mt: 2, zIndex: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        {busy && <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><CircularProgress size={18} /><Typography variant="body2">{frozen ? w.sending : w.checking}</Typography></Stack>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button onClick={back} disabled={busy || Boolean(frozen)}>{w.discard}</Button>
          <Button variant="outlined" disabled={busy || Boolean(frozen)} onClick={() => run(false)}>{w.check}</Button>
          <Button variant="contained" disabled={busy || !context.writeEnabled} onClick={() => run(true)}>{frozen ? w.retry : w.send}</Button>
        </Stack>
      </Box>
    </>}
    <Accordion sx={{ mt: 3 }} onChange={(_, open) => { if (open && historyRows === null) loadHistory(); }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={600}>{w.history}</Typography></AccordionSummary>
      <AccordionDetails>
        <Button disabled={historyLoading} onClick={loadHistory}>{w.refresh}</Button>
        {historyLoading && <CircularProgress size={20} />}{historyError && <Alert severity="error">{historyError}</Alert>}
        {historyRows?.length === 0 && <Typography>{w.noHistory}</Typography>}
        {(historyRows || []).map((entry) => <Box key={entry.OperationId} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography>{entry.CustomerNumber || '–'} {entry.CustomerName || ''}</Typography>
          <Typography variant="body2">{new Date(entry.CreatedAt).toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE')} · {entry.UserShortCode} · {w.status}: {entry.Status}{entry.ErrorCode ? ` · ${entry.ErrorCode}` : ''}</Typography>
          <Typography variant="caption">{w.key}: {entry.ErpOperationId || entry.OperationId}</Typography>
        </Box>)}
      </AccordionDetails>
    </Accordion>
  </Box>;
}

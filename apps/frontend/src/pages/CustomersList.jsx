import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Button,
  InputAdornment,
  Radio,
  RadioGroup,
  FormControlLabel,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';
import { createReturnTo } from '../utils/navigation.js';
import { getCustomerDisplayName } from '../utils/customerDisplayName.js';
import {
  CUSTOMER_SELECTION_CHANGED,
  getSelectedCustomer,
  setSelectedCustomer,
} from '../utils/customerSelection.js';
import {
  getRecentCustomers,
  getRecentCustomersStorageKey,
  RECENT_CUSTOMERS_LIMIT,
  recordRecentCustomer,
  RECENT_CUSTOMERS_CHANGED,
} from '../utils/recentCustomers.js';

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';
  return [street, [plz, ort].filter(Boolean).join(' '), lk].filter(Boolean).join(', ');
}

const ROLLBACK_PREVIEW_LABELS = {
  vorgangId: ['Vorgangs-ID', 'Operation ID'],
  art: ['Vorgangsart', 'Operation type'],
  kundennummer: ['Kundennummer', 'Customer number'],
  aktion: ['Umfang', 'Scope'],
  fristBis: ['Rückbaufrist', 'Rollback deadline'],
  ausfuehrbar: ['Rückbau möglich', 'Rollback possible'],
  mandanten: ['Betroffene Mandanten', 'Affected mandants'],
  mandant: ['Mandant', 'Mandant'],
  zeilen: ['Betroffene Datenzeilen', 'Affected data rows'],
  tabelle: ['Tabelle', 'Table'],
  schluessel: ['Datensatzschlüssel', 'Record key'],
  hindernisse: ['Hindernisse', 'Blockers'],
  aenderungen: ['Änderungen seit Anlage', 'Changes since creation'],
  geaenderteFelder: ['Geänderte Felder', 'Changed fields'],
  belege: ['Belege', 'Documents'],
  status: ['Status', 'Status'],
  code: ['Code', 'Code'],
  nachricht: ['Hinweis', 'Message'],
  abhilfe: ['Empfohlene Maßnahme', 'Suggested action'],
  ergebnis: ['Ergebnis', 'Result'],
  vorhanden: ['Vorhanden', 'Existing value'],
  eingabe: ['Eingabe', 'Submitted value'],
  wert: ['Wert', 'Value'],
  grund: ['Grund', 'Reason'],
  geprueftAm: ['Geprüft am', 'Checked at'],
};

function rollbackPreviewLabel(key, lang) {
  const known = ROLLBACK_PREVIEW_LABELS[key];
  if (known) return known[lang === 'en' ? 1 : 0];
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toLocaleUpperCase(lang === 'en' ? 'en' : 'de'));
}

function rollbackPreviewScalar(value, key, lang) {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? (lang === 'en' ? 'Yes' : 'Ja') : (lang === 'en' ? 'No' : 'Nein');
  if (typeof value === 'string') {
    const normalized = value.toLocaleLowerCase('de-DE');
    const knownValues = {
      art: { anlegen: ['Kundenanlage', 'Customer creation'], kopieren: ['Kundenkopie', 'Customer copy'], nachtragenAnsprechpartner: ['Ansprechpartner ergänzen', 'Add contact'], nachtragenLieferanschrift: ['Lieferanschrift ergänzen', 'Add delivery address'] },
      aktion: { komplett: ['Vollständig', 'Complete'], teilweise: ['Teilweise', 'Partial'] },
    };
    const translated = knownValues[key]?.[normalized];
    if (translated) return translated[lang === 'en' ? 1 : 0];
  }
  if (typeof value === 'string' && /(frist|datum|date|zeit|checked|created|updated|geprueft|angelegt|geändert|geaendert)/i.test(key || '')) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE');
  }
  return String(value);
}

function rollbackPreviewEntryTitle(entry, parentKey, index, lang) {
  if (parentKey === 'mandanten' && entry?.mandant) return `${rollbackPreviewLabel('mandant', lang)}: ${entry.mandant}`;
  if (parentKey === 'zeilen' && entry?.tabelle) {
    const key = entry.schluessel ? ` · ${rollbackPreviewLabel('schluessel', lang)}: ${rollbackPreviewScalar(entry.schluessel, 'schluessel', lang)}` : '';
    return `${rollbackPreviewLabel('tabelle', lang)}: ${entry.tabelle}${key}`;
  }
  return `${rollbackPreviewLabel(parentKey, lang)} ${index + 1}`;
}

function RollbackPreviewDetails({ value, fieldKey = '', lang = 'de', depth = 0 }) {
  if (value === null || value === undefined || value === '') {
    return <Typography variant="body2">–</Typography>;
  }
  if (typeof value !== 'object') {
    return <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{rollbackPreviewScalar(value, fieldKey, lang)}</Typography>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <Typography variant="body2">–</Typography>;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {value.map((entry, index) => {
          const isRecord = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
          const title = isRecord ? rollbackPreviewEntryTitle(entry, fieldKey, index, lang) : null;
          const record = isRecord && (fieldKey === 'mandanten' || fieldKey === 'zeilen')
            ? Object.fromEntries(Object.entries(entry).filter(([key]) => !((fieldKey === 'mandanten' && key === 'mandant') || (fieldKey === 'zeilen' && ['tabelle', 'schluessel'].includes(key)))))
            : entry;
          return (
            <Box key={`${fieldKey}-${index}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25, minWidth: 0 }}>
              {title && <Typography variant="subtitle2" sx={{ mb: 1, overflowWrap: 'anywhere' }}>{title}</Typography>}
              <RollbackPreviewDetails value={record} fieldKey={fieldKey} lang={lang} depth={depth + 1} />
            </Box>
          );
        })}
      </Box>
    );
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return <Typography variant="body2">–</Typography>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
      {entries.map(([key, child]) => (
        <Box key={key} sx={{ display: 'grid', gridTemplateColumns: depth > 0 ? 'minmax(110px, 0.35fr) minmax(0, 1fr)' : 'minmax(130px, 0.32fr) minmax(0, 1fr)', gap: 1, alignItems: 'start', minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{rollbackPreviewLabel(key, lang)}</Typography>
          <RollbackPreviewDetails value={child} fieldKey={key} lang={lang} depth={depth + 1} />
        </Box>
      ))}
    </Box>
  );
}

function RollbackPreviewSummary({ preview, lang }) {
  const fields = ['art', 'kundennummer', 'aktion', 'vorgangId', 'fristBis', 'ausfuehrbar'];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
      {fields.filter((key) => preview[key] !== null && preview[key] !== undefined && preview[key] !== '').map((key) => (
        <Box key={key} sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">{rollbackPreviewLabel(key, lang)}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{rollbackPreviewScalar(preview[key], key, lang)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function CustomersList({ supplierOnly = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const [items, setItems] = React.useState([]);
  const PAGE_SIZE = 12;
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  const [searchField, setSearchField] = React.useState('name');
  const [reminderOnly, setReminderOnly] = React.useState(false);
  const [orderQuantity, setOrderQuantity] = React.useState(false);
  const [hideInactive, setHideInactive] = React.useState(false);
  const [appCreatedOnly, setAppCreatedOnly] = React.useState(false);
  const [ownShortCode, setOwnShortCode] = React.useState('');
  const [canCreateCustomer, setCanCreateCustomer] = React.useState(false);
  const [createCustomerDialogOpen, setCreateCustomerDialogOpen] = React.useState(false);
  const [canViewAppCreated, setCanViewAppCreated] = React.useState(false);
  const [canPreviewRollback, setCanPreviewRollback] = React.useState(false);
  const [canRollback, setCanRollback] = React.useState(false);
  const [rollbackDialog, setRollbackDialog] = React.useState(null);
  const [rollbackBusy, setRollbackBusy] = React.useState(false);
  const [rollbackError, setRollbackError] = React.useState('');
  const [rollbackNotice, setRollbackNotice] = React.useState('');
  const [selectedCustomer, setSelectedCustomerState] = React.useState(() => getSelectedCustomer());
  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);
  const searchFieldRef = React.useRef(searchField);
  const reminderOnlyRef = React.useRef(reminderOnly);
  const orderQuantityRef = React.useRef(orderQuantity);
  const hideInactiveRef = React.useRef(hideInactive);
  const appCreatedOnlyRef = React.useRef(appCreatedOnly);
  const hydratedFromStateRef = React.useRef(false);
  const skipSearchReloadRef = React.useRef(false);
  const loadRequestIdRef = React.useRef(0);
  const touchRef = React.useRef({ x: 0, y: 0 });
  const swipedRef = React.useRef(false);

  React.useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  React.useEffect(() => {
    qRef.current = q;
  }, [q]);

  React.useEffect(() => {
    searchFieldRef.current = searchField;
  }, [searchField]);

  React.useEffect(() => {
    reminderOnlyRef.current = reminderOnly;
  }, [reminderOnly]);

  React.useEffect(() => {
    orderQuantityRef.current = orderQuantity;
  }, [orderQuantity]);

  React.useEffect(() => {
    hideInactiveRef.current = hideInactive;
  }, [hideInactive]);

  React.useEffect(() => {
    appCreatedOnlyRef.current = appCreatedOnly;
  }, [appCreatedOnly]);

  const totalPages = meta.total !== null && meta.total !== undefined
    ? Math.max(1, Math.ceil(Number(meta.total) / (meta.pageSize || PAGE_SIZE)))
    : null;
  const isRecentMode = reminderOnly && searchField === 'recent';
  const isRecentListView = !q.trim() && !reminderOnly && !appCreatedOnly;

  const load = React.useCallback(async (opts = {}) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const currentMeta = metaRef.current || {};
    const requestedPage = opts.page ?? currentMeta.page ?? 1;
    const qVal = opts.q ?? qRef.current ?? '';
    const requestedSearchField = opts.searchField ?? searchFieldRef.current ?? 'name';
    const searchFieldVal = requestedSearchField === 'recent' ? 'name' : requestedSearchField;
    const reminderOnlyVal = opts.reminderOnly ?? reminderOnlyRef.current ?? false;
    const orderQuantityVal = opts.orderQuantity ?? orderQuantityRef.current ?? false;
    const hideInactiveVal = opts.hideInactive ?? hideInactiveRef.current ?? false;
    const appCreatedOnlyVal = opts.appCreatedOnly ?? appCreatedOnlyRef.current ?? false;
    const useRecentOrder = !qVal.trim() && !reminderOnlyVal && !appCreatedOnlyVal;
    const recentScope = supplierOnly ? 'suppliers' : 'customers';
    const recentCustomerIds = useRecentOrder
      ? getRecentCustomers(recentScope).map((customer) => String(customer.id || '').trim()).filter(Boolean)
      : [];
    const pageSize = useRecentOrder ? RECENT_CUSTOMERS_LIMIT : PAGE_SIZE;
    const page = useRecentOrder ? 1 : requestedPage;
    const useOrderQuantity = !reminderOnlyVal && !useRecentOrder && orderQuantityVal;
    const sortVal = useOrderQuantity ? 'orderCountLast2Years' : 'kd_Name1';
    const dirVal = useOrderQuantity ? 'DESC' : 'ASC';
    const searchPending = !reminderOnlyVal
      && Boolean(qVal.trim())
      && qVal.trim().length < SEARCH_MIN;
    const selectedCustomerForFocus = getSelectedCustomer();
    const requestedFocusCustomerId = opts.focusCustomerId !== undefined
      ? opts.focusCustomerId
      : selectedCustomerForFocus?.id;
    const focusCustomerId = appCreatedOnlyVal || (reminderOnlyVal && qVal.trim())
      ? ''
      : String(requestedFocusCustomerId || '').trim();
    try {
      setLoading(true);
      setError('');
      const [res, focusedCustomerRes] = await Promise.all([
        searchPending
          ? Promise.resolve({ data: [], meta: { page, pageSize, total: 0 } })
          : apiRequest(`/customers?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}&searchField=${encodeURIComponent(searchFieldVal)}&reminderOnly=${reminderOnlyVal ? '1' : '0'}&includeInactive=${useRecentOrder || !hideInactiveVal ? '1' : '0'}&supplierOnly=${supplierOnly ? '1' : '0'}&appCreated=${appCreatedOnlyVal ? '1' : '0'}&sort=${sortVal}&dir=${dirVal}${useRecentOrder ? `&recentCustomerIds=${encodeURIComponent(JSON.stringify(recentCustomerIds))}` : ''}`),
        focusCustomerId
          ? apiRequest(`/customers/${encodeURIComponent(focusCustomerId)}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (requestId !== loadRequestIdRef.current) return;
      const rows = res?.data || [];
      const focusedCustomer = focusCustomerId
        ? (
          (String(focusedCustomerRes?.data?.kd_KdNR || '').trim() === focusCustomerId
            ? focusedCustomerRes.data
            : null)
          || rows.find((row) => String(row?.kd_KdNR || '').trim() === focusCustomerId)
        )
        : null;
      const focusedCustomerIsValid = focusedCustomer
        && String(focusedCustomer?.kd_KdNR || '').trim() === focusCustomerId
        && (!supplierOnly || Boolean(focusedCustomer?.isSupplier));
      const displayRows = focusedCustomerIsValid
        ? [focusedCustomer, ...rows.filter((row) => String(row?.kd_KdNR || '').trim() !== focusCustomerId)]
        : rows;
      setItems(displayRows);
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      if (requestId === loadRequestIdRef.current) {
        setError(e?.message || t('loading_error'));
      }
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [supplierOnly, t]);

  React.useEffect(() => {
    const syncSelectedCustomer = () => setSelectedCustomerState(getSelectedCustomer());
    const syncRecentCustomers = (event) => {
      const currentScope = supplierOnly ? 'suppliers' : 'customers';
      if (event?.detail?.scope && event.detail.scope !== currentScope) return;
      if (event?.type === 'storage'
        && event.key
        && event.key !== getRecentCustomersStorageKey(currentScope)) return;
      if (qRef.current.trim() || reminderOnlyRef.current || appCreatedOnlyRef.current) return;
      load({
        page: 1,
        q: qRef.current,
        searchField: searchFieldRef.current,
        reminderOnly: reminderOnlyRef.current,
        orderQuantity: orderQuantityRef.current,
        hideInactive: hideInactiveRef.current,
        appCreatedOnly: appCreatedOnlyRef.current,
      });
    };

    window.addEventListener(CUSTOMER_SELECTION_CHANGED, syncSelectedCustomer);
    window.addEventListener(RECENT_CUSTOMERS_CHANGED, syncRecentCustomers);
    window.addEventListener('storage', syncSelectedCustomer);
    window.addEventListener('storage', syncRecentCustomers);
    return () => {
      window.removeEventListener(CUSTOMER_SELECTION_CHANGED, syncSelectedCustomer);
      window.removeEventListener(RECENT_CUSTOMERS_CHANGED, syncRecentCustomers);
      window.removeEventListener('storage', syncSelectedCustomer);
      window.removeEventListener('storage', syncRecentCustomers);
    };
  }, [load, supplierOnly]);

  React.useEffect(() => {
    const focusSelected = Boolean(location.state?.focusSelected);
    const listState = location.state?.listState;
    const afterSelect = location.state?.afterSelect || null;
    const selectedCustomerId = getSelectedCustomer()?.id;
    if (listState && (listState.page || listState.q !== undefined || listState.searchField !== undefined || listState.reminderOnly !== undefined || listState.orderQuantity !== undefined || listState.hideInactive !== undefined || listState.includeInactive !== undefined || listState.appCreatedOnly !== undefined)) {
      const restoredQ = String(listState.q || '');
      const restoredPage = Number(listState.page) > 0 ? Number(listState.page) : 1;
      const requestedSearchField = String(listState.searchField || 'name');
      const restoredSearchField = requestedSearchField === 'recent' ? 'name' : requestedSearchField;
      const restoredReminderOnly = Boolean(listState.reminderOnly);
      const restoredOrderQuantity = listState.orderQuantity !== undefined
        ? Boolean(listState.orderQuantity)
        : false;
      const restoredHideInactive = listState.hideInactive !== undefined
        ? Boolean(listState.hideInactive)
        : listState.includeInactive !== undefined
          ? !Boolean(listState.includeInactive)
          : false;
      const restoredAppCreatedOnly = Boolean(listState.appCreatedOnly);
      hydratedFromStateRef.current = true;
      skipSearchReloadRef.current = true;
      setQ(restoredQ);
      setSearchField(restoredSearchField);
      setReminderOnly(restoredReminderOnly);
      setOrderQuantity(restoredOrderQuantity);
      setHideInactive(restoredHideInactive);
      setAppCreatedOnly(restoredAppCreatedOnly);
      load({ page: restoredPage, q: restoredQ, searchField: restoredSearchField, reminderOnly: restoredReminderOnly, orderQuantity: restoredOrderQuantity, hideInactive: restoredHideInactive, appCreatedOnly: restoredAppCreatedOnly, focusCustomerId: selectedCustomerId });
      navigate(location.pathname, { replace: true, state: afterSelect ? { afterSelect } : null });
      return;
    }

    if (focusSelected) {
      const currentSelectedCustomer = getSelectedCustomer();
      hydratedFromStateRef.current = true;
      skipSearchReloadRef.current = true;
      setQ('');
      setSearchField('name');
      setReminderOnly(false);
      setOrderQuantity(false);
      setHideInactive(false);
      setAppCreatedOnly(false);
      load({
        page: 1,
        q: '',
        searchField: 'name',
        reminderOnly: false,
        orderQuantity: false,
        hideInactive: false,
        appCreatedOnly: false,
        focusCustomerId: currentSelectedCustomer?.id,
      });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (hydratedFromStateRef.current) return;
    hydratedFromStateRef.current = true;
    skipSearchReloadRef.current = true;
    load({ page: 1, q: '', searchField: 'name', reminderOnly: false, orderQuantity: false, hideInactive: false, appCreatedOnly: false, focusCustomerId: selectedCustomerId });
  }, [load, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    let alive = true;
    if (!supplierOnly) {
      apiRequest('/customer-creation/capabilities')
        .then((response) => {
          if (!alive) return;
          setCanCreateCustomer(Boolean(response?.data?.allowed));
          setCanViewAppCreated(Boolean(response?.data?.canViewAppCreated));
          setCanPreviewRollback(Boolean(response?.data?.canPreviewRollback));
          setCanRollback(Boolean(response?.data?.canRollback));
        })
        .catch(() => {
          if (!alive) return;
          setCanCreateCustomer(false);
          setCanViewAppCreated(false);
          setCanPreviewRollback(false);
          setCanRollback(false);
        });
    }
    (async () => {
      try {
        const res = await apiRequest('/me');
        if (!alive) return;
        setOwnShortCode(String(res?.shortCode || '').trim());
      } catch {
        if (!alive) return;
        setOwnShortCode('');
      }
    })();
    return () => { alive = false; };
  }, [supplierOnly]);

  React.useEffect(() => {
    if (skipSearchReloadRef.current) {
      skipSearchReloadRef.current = false;
      return undefined;
    }
    loadRequestIdRef.current += 1;
    if (q.trim()) setItems([]);
    const handle = setTimeout(() => {
      const qVal = q.trim();
      if (qVal.length === 0 || qVal.length >= SEARCH_MIN || !reminderOnly) {
        load({ page: 1, q: qVal, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly });
      } else {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly, load]);

  const selectCustomerRow = React.useCallback((row) => {
    const next = setSelectedCustomer({
      id: row?.kd_KdNR,
      name: getCustomerDisplayName(row),
      address: buildAddress(row),
      representative: row?.kd_Aussendienst || '',
    });
    setSelectedCustomerState(next);
    recordRecentCustomer({
      id: row?.kd_KdNR,
      name: getCustomerDisplayName(row),
      address: buildAddress(row),
      representative: row?.kd_Aussendienst || '',
    }, supplierOnly ? 'suppliers' : 'customers');
    const afterSelect = location.state?.afterSelect;
    if (afterSelect?.to) {
      navigate(afterSelect.to, { replace: true, state: afterSelect.state || null });
      return;
    }

    if (isRecentListView) return;

    load({
      page: metaRef.current.page || 1,
      q: qRef.current,
      searchField: searchFieldRef.current,
      reminderOnly: reminderOnlyRef.current,
      orderQuantity: orderQuantityRef.current,
      hideInactive: hideInactiveRef.current,
      appCreatedOnly: appCreatedOnlyRef.current,
      focusCustomerId: next?.id,
    });
  }, [isRecentListView, load, location.state, navigate]);

  const openRollback = async (row) => {
    const entry = row?.appCreation;
    if (!entry?.operationId) return;
    setRollbackError('');
    setRollbackNotice('');
    const resumable = ['partial', 'unknown', 'sending'].includes(String(entry.rollbackStatus || '').toLowerCase());
    if (resumable && entry.rollbackId && entry.rollbackPreviewJson) {
      try {
        setRollbackDialog({
          row,
          rollbackId: entry.rollbackId,
          preview: JSON.parse(entry.rollbackPreviewJson),
          reason: entry.rollbackReason || '',
          resumable: true,
          loading: false,
        });
        return;
      } catch {
        setRollbackError('');
      }
    }
    setRollbackDialog({ row, loading: true, resumable: false, reason: '' });
    try {
      const response = await apiRequest(`/customer-creation/operations/${encodeURIComponent(entry.operationId)}/rueckbau-vorschau`);
      setRollbackDialog({
        row,
        rollbackId: response?.data?.rollbackId,
        preview: response?.data?.preview,
        reason: response?.data?.reason || '',
        resumable: Boolean(response?.data?.resumable),
        loading: false,
      });
    } catch (error) {
      setRollbackError(error?.message || t('customer_rollback_preview_failed'));
      setRollbackDialog(null);
    }
  };

  const submitRollback = async () => {
    if (!rollbackDialog?.rollbackId || !rollbackDialog?.row?.appCreation?.operationId) return;
    setRollbackBusy(true);
    setRollbackError('');
    try {
      const response = await apiRequest(
        `/customer-creation/operations/${encodeURIComponent(rollbackDialog.row.appCreation.operationId)}/rueckbau/${encodeURIComponent(rollbackDialog.rollbackId)}`,
        { method: 'POST', body: JSON.stringify({ begruendung: rollbackDialog.reason }) },
      );
      const state = String(response?.meta?.state || response?.data?.status || '').toLowerCase();
      await load({ page: metaRef.current.page || 1, appCreatedOnly: true });
      if (state === 'partial' || state === 'teilweisezurueckgebaut') {
        setRollbackDialog((current) => current ? { ...current, resumable: true } : current);
        setRollbackNotice(t('customer_rollback_partial'));
      } else {
        setRollbackDialog(null);
        setRollbackNotice(t('customer_rollback_complete'));
      }
    } catch (error) {
      setRollbackError(error?.message || t('customer_rollback_failed'));
      await load({ page: metaRef.current.page || 1, appCreatedOnly: true });
    } finally {
      setRollbackBusy(false);
    }
  };

  const previewExecutable = rollbackDialog?.preview?.ausfuehrbar === true;
  const reasonLength = String(rollbackDialog?.reason || '').trim().length;
  const canSubmitRollback = Boolean(rollbackDialog?.rollbackId && canRollback
    && (rollbackDialog.resumable || previewExecutable)
    && (rollbackDialog.resumable || (reasonLength >= 10 && reasonLength <= 500)));
  const openCustomerCreate = () => {
    setCreateCustomerDialogOpen(false);
    navigate('/customers/new', { state: {
      returnTo: createReturnTo(location, { ...location.state,
        listState: { page: meta.page || 1, q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly },
      }),
    } });
  };

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2, minWidth: 0 }}>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {reminderOnly ? t('customers_reminders_title') : t(supplierOnly ? 'suppliers_title' : 'customers_title')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {!isRecentListView && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              aria-label="zurueck"
              onClick={() => load({ page: Math.max((meta.page || 1) - 1, 1), q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly })}
              disabled={(meta.page || 1) <= 1}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
              {t('page_label')} {meta.page || 1}/{totalPages || '?'}
            </Typography>
            <IconButton
              aria-label="weiter"
              onClick={() => load({ page: (meta.page || 1) + 1, q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly })}
              disabled={meta.total !== null && meta.total !== undefined
                ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total
                : false}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Box>
        )}
        {!supplierOnly && canCreateCustomer && (
          <Tooltip title={t('customer_create_title')}>
            <IconButton color="primary" aria-label={t('customer_create_title')}
              onClick={() => setCreateCustomerDialogOpen(true)}>
              <AddIcon />
            </IconButton>
          </Tooltip>
        )}
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={isRecentMode
              ? t('customers_search_mode_recent')
              : searchField === 'article'
                ? t(supplierOnly ? 'suppliers_search_articles' : 'customers_search_articles')
                : t(supplierOnly ? 'suppliers_search' : 'customers_search')}
            value={q}
            disabled={isRecentMode}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ opacity: 0.6 }} />
                </InputAdornment>
              ),
            }}
          />
          <RadioGroup
            row
            value={searchField}
            onChange={(e) => {
              const nextField = e.target.value;
              if (nextField === 'sales' && ownShortCode) {
                setSearchField(nextField);
                setQ(ownShortCode);
              } else if (nextField === 'recent') {
                setSearchField('name');
                setQ('');
                setReminderOnly(false);
                setOrderQuantity(false);
                setHideInactive(false);
              } else {
                setSearchField(nextField);
              }
            }}
            sx={{
              width: '100%',
              flexWrap: { xs: 'wrap', md: 'nowrap' },
              gap: 0,
              justifyContent: 'space-between',
              '& .MuiFormControlLabel-root': {
                flex: { xs: '1 1 50%', md: `1 1 ${reminderOnly ? '16.6667%' : '20%'}` },
                margin: 0,
                minWidth: 0,
              },
              '& .MuiFormControlLabel-label': {
                fontSize: '0.72rem',
                letterSpacing: '-0.01em',
              },
            }}
          >
            <FormControlLabel
              value="name"
              control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
              label={t('customers_search_mode_name')}
            />
            <FormControlLabel
              value="plz"
              control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
              label={t('customers_search_mode_plz')}
            />
            <FormControlLabel
              value="region"
              control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
              label={t('customers_search_mode_region')}
            />
            <FormControlLabel
              value="sales"
              control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
              label={t('customers_search_mode_sales')}
            />
            <FormControlLabel
              value="article"
              control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
              label={t(supplierOnly ? 'suppliers_search_mode_article' : 'customers_search_mode_article')}
            />
            {reminderOnly && (
              <FormControlLabel
                value="recent"
                control={<Radio size="small" sx={{ p: 0.35, mr: 0.2 }} />}
                label={t('customers_search_mode_recent')}
              />
            )}
          </RadioGroup>
          {!reminderOnly && !isRecentListView && (
            <Box
              sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(2, minmax(0, 1fr))',
                },
                alignItems: 'center',
              }}
            >
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={orderQuantity}
                    onChange={(event) => setOrderQuantity(event.target.checked)}
                  />
                )}
                label={t(supplierOnly ? 'suppliers_sort_order_quantity' : 'customers_sort_order_quantity')}
                sx={{
                  m: 0,
                  justifySelf: 'start',
                  minWidth: 0,
                  '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
                }}
              />
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={hideInactive}
                    onChange={(event) => setHideInactive(event.target.checked)}
                  />
                )}
                label={t('customers_hide_inactive')}
                sx={{
                  m: 0,
                  justifySelf: 'start',
                  minWidth: 0,
                  '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
                }}
              />
            </Box>
          )}
          {!supplierOnly && canViewAppCreated && (
            <FormControlLabel
              control={(
                <Switch
                  size="small"
                  checked={appCreatedOnly}
                  onChange={(event) => {
                    setAppCreatedOnly(event.target.checked);
                    setRollbackNotice('');
                  }}
                />
              )}
              label={t('customer_created_via_app_filter')}
              sx={{
                m: 0,
                width: '100%',
                '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
              }}
            />
          )}
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {rollbackNotice && <Alert severity="success" sx={{ mb: 2 }}>{rollbackNotice}</Alert>}
      {rollbackError && <Alert severity="error" sx={{ mb: 2 }}>{rollbackError}</Alert>}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>
          {appCreatedOnly
            ? t('customer_created_via_app_empty')
            : isRecentListView
              ? t(supplierOnly ? 'suppliers_recent_empty' : 'customers_recent_empty')
            : !reminderOnly && q.trim().length >= SEARCH_MIN
              ? t(supplierOnly ? 'suppliers_search_empty' : 'customers_search_empty')
              : t(supplierOnly ? 'suppliers_empty' : 'customers_empty')}
        </Typography>
      )}

      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((row) => {
            const id = row?.kd_KdNR;
            const name = getCustomerDisplayName(row);
            const isSelected = selectedCustomer?.id && String(selectedCustomer.id) === String(id);
            const appCreation = row?.appCreation;
            const rollbackState = String(appCreation?.rollbackStatus || '').toLowerCase();
            const canResumeRollback = ['partial', 'unknown', 'sending'].includes(rollbackState);
            return (
              <Card
                key={id ?? name}
                sx={{
                  borderRadius: 2,
                  border: isSelected ? '2px solid' : '1px solid rgba(0,0,0,0.08)',
                  borderColor: isSelected ? 'primary.main' : 'rgba(0,0,0,0.08)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  width: '100%',
                  minWidth: 0,
                }}
                onTouchStart={(e) => {
                  const touch = e.changedTouches?.[0];
                  touchRef.current = {
                    x: Number(touch?.clientX || 0),
                    y: Number(touch?.clientY || 0),
                  };
                  swipedRef.current = false;
                }}
                onTouchEnd={(e) => {
                  const touch = e.changedTouches?.[0];
                  const x = Number(touch?.clientX || 0);
                  const y = Number(touch?.clientY || 0);
                  const dx = x - touchRef.current.x;
                  const dy = y - touchRef.current.y;
                  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy)) {
                    swipedRef.current = true;
                    selectCustomerRow(row);
                  }
                }}
                onClick={() => {
                  if (swipedRef.current) {
                    swipedRef.current = false;
                    return;
                  }
                  navigate(`/customers/${encodeURIComponent(id)}`, {
                    state: {
                      detailView: supplierOnly ? 'supplier' : 'customer',
                      fromCustomers: { page: meta.page || 1, q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly },
                      afterSelect: location.state?.afterSelect || null,
                      returnTo: createReturnTo(location, {
                        listState: { page: meta.page || 1, q, searchField, reminderOnly, orderQuantity, hideInactive, appCreatedOnly },
                        afterSelect: location.state?.afterSelect || null,
                      }),
                    },
                  });
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pr: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {name || String(id ?? '')}
                      </Typography>
                      {appCreatedOnly && appCreation && (
                        <Typography variant="caption" sx={{ opacity: 0.72, display: 'block' }}>
                          {t('customer_created_via_app_by', { shortCode: appCreation.createdBy })}
                          {appCreation.createdAt ? ` · ${new Date(appCreation.createdAt).toLocaleDateString()}` : ''}
                          {appCreation.rollbackStatus === 'partial' ? ` · ${t('customer_rollback_partial_status')}` : ''}
                          {appCreation.rollbackStatus === 'unknown' ? ` · ${t('customer_rollback_unknown_status')}` : ''}
                        </Typography>
                      )}
                    </Box>
                    {Number(row?.reminderInvoicesCount) > 0 && (
                      <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        ({Number(row.reminderInvoicesCount)})
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                    {appCreatedOnly && appCreation && canPreviewRollback && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<UndoIcon />}
                        onClick={(event) => {
                          event.stopPropagation();
                          openRollback(row);
                        }}
                      >
                        {canResumeRollback ? t('customer_rollback_continue') : t('customer_rollback_preview_action')}
                      </Button>
                    )}
                    <Box sx={{ width: 30, display: 'flex', justifyContent: 'center' }}>
                      {isSelected ? <CheckCircleIcon color="primary" /> : <ChevronRightIcon />}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
      {!loading && !error && !reminderOnly && !appCreatedOnly
        && q.trim().length >= SEARCH_MIN && Number(meta.total) === 0 && items.length > 0 && (
        <Typography sx={{ opacity: 0.7, mt: 1 }}>
          {t(supplierOnly ? 'suppliers_search_empty' : 'customers_search_empty')}
        </Typography>
      )}
      </Box>
      <Dialog
        open={createCustomerDialogOpen}
        onClose={() => setCreateCustomerDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {t('customer_create_dialog_title')}
          <IconButton
            aria-label={t('customer_create_dialog_close')}
            onClick={() => setCreateCustomerDialogOpen(false)}
            edge="end"
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <Button variant="contained" fullWidth onClick={openCustomerCreate}>
              {t('customer_create_dialog_app')}
            </Button>
            <Button
              component="a"
              href="https://bcs.app.mlholding.org/scan"
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              fullWidth
              onClick={() => setCreateCustomerDialogOpen(false)}
            >
              {t('customer_create_dialog_scan_card')}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(rollbackDialog)}
        onClose={() => { if (!rollbackBusy) setRollbackDialog(null); }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t('customer_rollback_preview_title')}</DialogTitle>
        <DialogContent dividers>
          {rollbackDialog?.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : rollbackDialog?.preview ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Alert severity={previewExecutable ? 'success' : 'warning'}>
                {previewExecutable ? t('customer_rollback_preview_allowed') : t('customer_rollback_preview_blocked')}
              </Alert>
              <RollbackPreviewSummary preview={rollbackDialog.preview} lang={lang} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('customer_rollback_preview_details')}</Typography>
                <RollbackPreviewDetails
                  value={Object.fromEntries(Object.entries(rollbackDialog.preview).filter(([key]) => !['art', 'kundennummer', 'aktion', 'vorgangId', 'fristBis', 'ausfuehrbar'].includes(key)))}
                  lang={lang}
                />
              </Box>
              {!canRollback && <Alert severity="info">{t('customer_rollback_write_disabled')}</Alert>}
              {rollbackDialog.resumable ? (
                <Alert severity="info">{t('customer_rollback_partial')}</Alert>
              ) : (
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={5}
                  required
                  label={t('customer_rollback_reason')}
                  value={rollbackDialog.reason || ''}
                  inputProps={{ maxLength: 500 }}
                  helperText={t('customer_rollback_reason_hint')}
                  error={reasonLength > 0 && reasonLength < 10}
                  onChange={(event) => setRollbackDialog((current) => current ? { ...current, reason: event.target.value } : current)}
                />
              )}
              {rollbackError && <Alert severity="error">{rollbackError}</Alert>}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setRollbackDialog(null)} disabled={rollbackBusy}>{t('customer_rollback_close')}</Button>
          <Button
            variant="contained"
            startIcon={rollbackBusy ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
            onClick={submitRollback}
            disabled={rollbackBusy || !canSubmitRollback}
          >
            {rollbackDialog?.resumable ? t('customer_rollback_continue') : t('customer_rollback_execute')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

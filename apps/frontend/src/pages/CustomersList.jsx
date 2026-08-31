import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { SEARCH_MIN } from '../config.js';
import { useI18n } from '../utils/i18n.jsx';
import { getSelectedCustomer, setSelectedCustomer } from '../utils/customerSelection.js';

function getCustomerName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  return name1 || name2 || '';
}

function isValidCustomerName(name) {
  const trimmed = String(name || '').trim();
  return trimmed.length >= 3;
}

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';
  return [street, [plz, ort].filter(Boolean).join(' '), lk].filter(Boolean).join(', ');
}

export default function CustomersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [items, setItems] = React.useState([]);
  const PAGE_SIZE = 12;
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  const [searchField, setSearchField] = React.useState('name');
  const [reminderOnly, setReminderOnly] = React.useState(false);
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [ownShortCode, setOwnShortCode] = React.useState('');
  const [selectedCustomer, setSelectedCustomerState] = React.useState(() => getSelectedCustomer());
  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);
  const searchFieldRef = React.useRef(searchField);
  const reminderOnlyRef = React.useRef(reminderOnly);
  const includeInactiveRef = React.useRef(includeInactive);
  const hydratedFromStateRef = React.useRef(false);
  const skipSearchReloadRef = React.useRef(false);
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
    includeInactiveRef.current = includeInactive;
  }, [includeInactive]);

  const totalPages = meta.total !== null && meta.total !== undefined
    ? Math.max(1, Math.ceil(Number(meta.total) / (meta.pageSize || PAGE_SIZE)))
    : null;

  const load = React.useCallback(async (opts = {}) => {
    const currentMeta = metaRef.current || {};
    const page = opts.page ?? currentMeta.page ?? 1;
    const pageSize = PAGE_SIZE;
    const qVal = opts.q ?? qRef.current ?? '';
    const searchFieldVal = opts.searchField ?? searchFieldRef.current ?? 'name';
    const reminderOnlyVal = opts.reminderOnly ?? reminderOnlyRef.current ?? false;
    const includeInactiveVal = opts.includeInactive ?? includeInactiveRef.current ?? false;
    const focusCustomerId = String(opts.focusCustomerId || '').trim();
    try {
      setLoading(true);
      setError('');
      const [res, focusedCustomerRes] = await Promise.all([
        apiRequest(`/customers?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}&searchField=${encodeURIComponent(searchFieldVal)}&reminderOnly=${reminderOnlyVal ? '1' : '0'}&includeInactive=${includeInactiveVal ? '1' : '0'}&sort=kd_Name1&dir=ASC`),
        focusCustomerId
          ? apiRequest(`/customers/${encodeURIComponent(focusCustomerId)}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      const rows = res?.data || [];
      const filtered = rows.filter((row) => isValidCustomerName(getCustomerName(row)));
      const focusedCustomer = focusedCustomerRes?.data;
      const focusedCustomerIsValid = focusedCustomer
        && String(focusedCustomer?.kd_KdNR || '').trim() === focusCustomerId
        && isValidCustomerName(getCustomerName(focusedCustomer));
      const displayRows = focusedCustomerIsValid
        ? [focusedCustomer, ...filtered.filter((row) => String(row?.kd_KdNR || '').trim() !== focusCustomerId)]
        : filtered;
      setItems(displayRows);
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const focusSelected = Boolean(location.state?.focusSelected);
    const listState = location.state?.listState;
    const selectedCustomerId = getSelectedCustomer()?.id;
    if (listState && (listState.page || listState.q !== undefined || listState.searchField !== undefined || listState.reminderOnly !== undefined || listState.includeInactive !== undefined)) {
      const restoredQ = String(listState.q || '');
      const restoredPage = Number(listState.page) > 0 ? Number(listState.page) : 1;
      const restoredSearchField = String(listState.searchField || 'name');
      const restoredReminderOnly = Boolean(listState.reminderOnly);
      const restoredIncludeInactive = Boolean(listState.includeInactive);
      hydratedFromStateRef.current = true;
      skipSearchReloadRef.current = true;
      setQ(restoredQ);
      setSearchField(restoredSearchField);
      setReminderOnly(restoredReminderOnly);
      setIncludeInactive(restoredIncludeInactive);
      load({ page: restoredPage, q: restoredQ, searchField: restoredSearchField, reminderOnly: restoredReminderOnly, includeInactive: restoredIncludeInactive, focusCustomerId: selectedCustomerId });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (focusSelected) {
      const currentSelectedCustomer = getSelectedCustomer();
      hydratedFromStateRef.current = true;
      skipSearchReloadRef.current = true;
      setQ('');
      setSearchField('name');
      setReminderOnly(false);
      setIncludeInactive(false);
      load({
        page: 1,
        q: '',
        searchField: 'name',
        reminderOnly: false,
        includeInactive: false,
        focusCustomerId: currentSelectedCustomer?.id,
      });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    if (hydratedFromStateRef.current) return;
    hydratedFromStateRef.current = true;
    skipSearchReloadRef.current = true;
    load({ page: 1, q: '', searchField: 'name', reminderOnly: false, includeInactive: false, focusCustomerId: selectedCustomerId });
  }, [load, location.pathname, location.state, navigate]);

  React.useEffect(() => {
    let alive = true;
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
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const qVal = q.trim();
      if (skipSearchReloadRef.current) {
        skipSearchReloadRef.current = false;
        return;
      }
      if (qVal.length === 0 || qVal.length >= SEARCH_MIN) {
        load({ page: 1, q: qVal, searchField, reminderOnly, includeInactive });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q, searchField, reminderOnly, includeInactive, load]);

  const selectCustomerRow = React.useCallback((row) => {
    const next = setSelectedCustomer({
      id: row?.kd_KdNR,
      name: getCustomerName(row),
      address: buildAddress(row),
      representative: row?.kd_Aussendienst || '',
    });
    setSelectedCustomerState(next);
    const afterSelect = location.state?.afterSelect;
    if (afterSelect?.to) {
      navigate(afterSelect.to, { replace: true, state: afterSelect.state || null });
    }
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', height: 'calc(100vh - 96px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2, minWidth: 0 }}>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {reminderOnly ? t('customers_reminders_title') : t('customers_title')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            aria-label="zurueck"
            onClick={() => load({ page: Math.max((meta.page || 1) - 1, 1), q, searchField, reminderOnly, includeInactive })}
            disabled={(meta.page || 1) <= 1}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
            {t('page_label')} {meta.page || 1}/{totalPages || '?'}
          </Typography>
          <IconButton
            aria-label="weiter"
            onClick={() => load({ page: (meta.page || 1) + 1, q, searchField, reminderOnly, includeInactive })}
            disabled={meta.total !== null && meta.total !== undefined
              ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total
              : false}
          >
            <ArrowForwardIcon />
          </IconButton>
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            fullWidth
            size="small"
            placeholder={t('customers_search')}
            value={q}
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
              setSearchField(nextField);
              if (nextField === 'sales' && ownShortCode) {
                setQ(ownShortCode);
              }
            }}
            sx={{
              width: '100%',
              flexWrap: { xs: 'wrap', md: 'nowrap' },
              gap: 0,
              justifyContent: 'space-between',
              '& .MuiFormControlLabel-root': {
                flex: { xs: '1 1 50%', md: '1 1 25%' },
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
          </RadioGroup>
          {!reminderOnly && (
            <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              <FormControlLabel
                control={(
                  <Switch
                    size="small"
                    checked={includeInactive}
                    onChange={(event) => setIncludeInactive(event.target.checked)}
                  />
                )}
                label={t('customers_show_inactive')}
                sx={{
                  mr: 0,
                  '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>{t('customers_empty')}</Typography>
      )}

      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((row) => {
            const id = row?.kd_KdNR;
            const name = getCustomerName(row);
            const isSelected = selectedCustomer?.id && String(selectedCustomer.id) === String(id);
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
                      fromCustomers: { page: meta.page || 1, q, searchField, reminderOnly, includeInactive },
                      afterSelect: location.state?.afterSelect || null,
                    },
                  });
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, pr: 2 }}>
                    <Typography variant="body1" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {name || String(id ?? '')}
                    </Typography>
                    {Number(row?.reminderInvoicesCount) > 0 && (
                      <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        ({Number(row.reminderInvoicesCount)})
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                    {isSelected ? <CheckCircleIcon color="primary" /> : <ChevronRightIcon />}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
      </Box>
    </Box>
  );
}

import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import {
  CUSTOMER_SELECTION_CHANGED,
  getSelectedCustomer,
  setSelectedCustomer,
} from '../utils/customerSelection.js';
import {
  MAP_PROVIDER_APPLE,
  MAP_PROVIDER_GOOGLE,
  buildMapUrl,
  getMapPreference,
  setMapPreference,
} from '../utils/mapPreference.js';

function getCustomerName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  return name1 || name2 || '';
}

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const region = row?.kd_Region ? String(row.kd_Region).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';

  const line1 = street;
  const line2 = [plz, ort].filter(Boolean).join(' ');
  const line3 = region;
  const line4 = lk;

  return [line1, line2, line3, line4].filter(Boolean).join('\n');
}

function normalizeRepresentatives(item) {
  const fromApi = Array.isArray(item?.representatives) ? item.representatives : [];
  const normalizedApi = fromApi
    .map((rep, idx) => {
      const name = rep?.name ? String(rep.name).trim() : '';
      const phone = rep?.phone ? String(rep.phone).trim() : '';
      const email = rep?.email ? String(rep.email).trim() : '';
      const key = rep?.id ?? `${name}-${idx}`;
      return { key, name, phone, email };
    })
    .filter((rep) => rep.name || rep.phone || rep.email);

  if (normalizedApi.length) return normalizedApi;

  const legacyName = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const legacyPhone = item?.kd_Telefon ? String(item.kd_Telefon).trim() : '';
  const legacyEmail = item?.kd_eMail ? String(item.kd_eMail).trim() : '';
  if (legacyName || legacyPhone || legacyEmail) {
    return [{ key: 'legacy', name: legacyName, phone: legacyPhone, email: legacyEmail }];
  }

  return [];
}

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-DE');
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatEuro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function truncateActivityText(value, maxLength = 30) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

const CURRENT_YEAR = new Date().getFullYear();
const DOCUMENT_SCOPE_YEARS = Array.from(
  { length: CURRENT_YEAR - 1999 },
  (_value, index) => CURRENT_YEAR - index,
);

function DocumentScopeControls({
  t,
  scope,
  year,
  onScopeChange,
  onYearChange,
  includeOpen = false,
}) {
  return (
    <RadioGroup
      row
      value={scope}
      onChange={onScopeChange}
      sx={{
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 0.25,
        '& .MuiFormControlLabel-root': {
          margin: 0,
          minWidth: 0,
        },
        '& .MuiFormControlLabel-label': {
          fontSize: '0.72rem',
        },
      }}
    >
      {includeOpen && (
        <FormControlLabel
          value="open"
          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
          label={t('document_scope_open')}
        />
      )}
      <FormControlLabel
        value="3m"
        control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
        label={t('document_scope_3m')}
      />
      <FormControlLabel
        value="6m"
        control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
        label={t('document_scope_6m')}
      />
      <FormControlLabel
        value="year"
        control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
        label={t('document_scope_year')}
      />
      <TextField
        select
        size="small"
        value={String(year)}
        onChange={onYearChange}
        aria-label={t('document_scope_year_picker')}
        sx={{
          width: 76,
          ml: 0.25,
          '& .MuiInputBase-root': {
            height: 28,
            fontSize: '0.72rem',
          },
          '& .MuiSelect-select': {
            px: 0.75,
            py: 0.35,
          },
        }}
      >
        {DOCUMENT_SCOPE_YEARS.map((optionYear) => (
          <MenuItem key={optionYear} value={String(optionYear)}>
            {optionYear}
          </MenuItem>
        ))}
      </TextField>
    </RadioGroup>
  );
}

function InfoRow({ icon, label, value, link, onClick, forceRight = false }) {
  const content = link ? (
    <Box
      component="a"
      href={link}
      sx={{
        color: 'primary.main',
        textDecoration: 'underline',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      {value}
    </Box>
  ) : onClick ? (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        p: 0,
        border: 0,
        bgcolor: 'transparent',
        color: 'primary.main',
        textDecoration: 'underline',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'inherit',
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
    >
      {value}
    </Box>
  ) : (
    <Box>{value}</Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 0.5, sm: 2 },
        py: 0.75,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box
        sx={{
          width: { xs: '100%', sm: '45%' },
          textAlign: forceRight ? 'right' : { xs: 'left', sm: 'right' },
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          minWidth: 0,
        }}
      >
        {content}
      </Box>
    </Box>
  );
}

function CompactInfoRow({ icon, label, value }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        py: 0.75,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', minWidth: 0 }}>
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        sx={{
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const [item, setItem] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [selectedCustomer, setSelectedCustomerState] = React.useState(() => getSelectedCustomer());
  const [offerScope, setOfferScope] = React.useState('3m');
  const [offerYear, setOfferYear] = React.useState(CURRENT_YEAR);
  const [orderScope, setOrderScope] = React.useState('open');
  const [orderYear, setOrderYear] = React.useState(CURRENT_YEAR);
  const [invoiceScope, setInvoiceScope] = React.useState('open');
  const [invoiceYear, setInvoiceYear] = React.useState(CURRENT_YEAR);
  const [purchasedArticlesQuery, setPurchasedArticlesQuery] = React.useState('');
  const [mapChoiceOpen, setMapChoiceOpen] = React.useState(false);
  const [expandedActivities, setExpandedActivities] = React.useState({});
  const [expandedRepresentatives, setExpandedRepresentatives] = React.useState({});
  const [docs, setDocs] = React.useState({
    offers: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    orders: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    invoices: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    purchasedArticles: { expanded: false, loaded: false, loading: false, error: '', items: [] },
  });

  React.useEffect(() => {
    const syncCustomer = () => setSelectedCustomerState(getSelectedCustomer());
    window.addEventListener(CUSTOMER_SELECTION_CHANGED, syncCustomer);
    window.addEventListener('storage', syncCustomer);
    syncCustomer();
    return () => {
      window.removeEventListener(CUSTOMER_SELECTION_CHANGED, syncCustomer);
      window.removeEventListener('storage', syncCustomer);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest(`/customers/${encodeURIComponent(id)}`);
        if (!alive) return;
        setItem(res?.data || null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t('loading_error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [id, t]);

  const name = getCustomerName(item);
  const description = item?.kd_Notiz ? String(item.kd_Notiz) : '';
  const address = buildAddress(item);
  const addressForMap = address ? String(address).replace(/\n/g, ', ') : '';
  const homepageRaw = item?.kd_HomePage ? String(item.kd_HomePage).trim() : '';
  const homepageLink = homepageRaw
    ? (/^https?:\/\//i.test(homepageRaw) ? homepageRaw : `https://${homepageRaw}`)
    : '';
  const salesRep = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const reminderInvoicesCount = Number(item?.reminderInvoicesCount) || 0;
  const creditLimit = item?.creditLimit || null;
  const creditLimitText = creditLimit?.status === 'expired'
    ? t('credit_limit_expired')
    : creditLimit?.status === 'active'
      ? `${t('credit_limit_label')}: ${formatEuro(creditLimit.amount)}`
      : t('credit_limit_missing');
  const activities = Array.isArray(item?.activities) ? item.activities : [];
  const representatives = normalizeRepresentatives(item);
  const isSelectedCustomer = Boolean(
    selectedCustomer?.id && String(selectedCustomer.id) === String(id),
  );
  const openAddressWithProvider = React.useCallback((provider) => {
    const url = buildMapUrl(provider, addressForMap);
    if (!url) return;
    window.location.assign(url);
  }, [addressForMap]);
  const handleAddressClick = React.useCallback(() => {
    if (!addressForMap) return;
    const preference = getMapPreference();
    if (!preference) {
      setMapChoiceOpen(true);
      return;
    }
    openAddressWithProvider(preference);
  }, [addressForMap, openAddressWithProvider]);
  const chooseMapProvider = React.useCallback((provider) => {
    const next = setMapPreference(provider);
    setMapChoiceOpen(false);
    openAddressWithProvider(next);
  }, [openAddressWithProvider]);
  const handleSelectCustomer = React.useCallback(() => {
    const selected = setSelectedCustomer({
      id,
      name,
      address,
      representative: salesRep,
    });
    if (!selected) return;
    const afterSelect = location.state?.afterSelect;
    if (afterSelect?.to) {
      navigate(afterSelect.to, { replace: true, state: afterSelect.state || null });
    }
  }, [address, id, location.state, name, navigate, salesRep]);
  const offerEndpoint = `/customers/${encodeURIComponent(id)}/offers?scope=${encodeURIComponent(offerScope)}&year=${encodeURIComponent(offerYear)}`;
  const orderEndpoint = `/customers/${encodeURIComponent(id)}/orders?scope=${encodeURIComponent(orderScope)}&year=${encodeURIComponent(orderYear)}`;
  const invoiceEndpoint = `/customers/${encodeURIComponent(id)}/invoices?scope=${encodeURIComponent(invoiceScope)}&year=${encodeURIComponent(invoiceYear)}`;
  const purchasedArticlesEndpoint = `/customers/${encodeURIComponent(id)}/purchased-articles`;
  const filteredPurchasedArticleGroups = React.useMemo(() => {
    const query = String(purchasedArticlesQuery || '').trim().toLowerCase();
    const groups = Array.isArray(docs.purchasedArticles.items) ? docs.purchasedArticles.items : [];
    if (!query) return groups;
    return groups
      .map((group) => {
        const groupMatches = String(group?.name || '').toLowerCase().includes(query);
        const articles = Array.isArray(group?.articles) ? group.articles : [];
        return {
          ...group,
          articles: groupMatches
            ? articles
            : articles.filter((itemRow) => String(itemRow?.article || '').toLowerCase().includes(query)),
        };
      })
      .filter((group) => group.articles.length > 0);
  }, [docs.purchasedArticles.items, purchasedArticlesQuery]);
  const loadDocSection = React.useCallback(async (section, endpoint) => {
    setDocs((prev) => ({
      ...prev,
      [section]: { ...prev[section], loading: true, error: '' },
    }));
    try {
      const res = await apiRequest(endpoint);
      const items = Array.isArray(res?.data) ? res.data : [];
      setDocs((prev) => ({
        ...prev,
        [section]: { ...prev[section], loading: false, loaded: true, error: '', items },
      }));
    } catch (e) {
      setDocs((prev) => ({
        ...prev,
        [section]: { ...prev[section], loading: false, loaded: true, error: e?.message || t('loading_error') },
      }));
    }
  }, [t]);

  const onToggleSection = React.useCallback((section, endpoint) => (_event, expanded) => {
    setDocs((prev) => ({
      ...prev,
      [section]: { ...prev[section], expanded },
    }));
    if (expanded && !docs[section].loaded && !docs[section].loading) {
      loadDocSection(section, endpoint);
    }
  }, [docs, loadDocSection]);

  const handleBack = React.useCallback(() => {
    const fromCustomers = location.state?.fromCustomers;
    if (fromCustomers) {
      navigate('/customers', { state: { listState: fromCustomers } });
      return;
    }
    navigate(-1);
  }, [location.state, navigate]);

  const handleInvoiceScopeChange = React.useCallback((event) => {
    const nextScope = ['open', '3m', '6m', 'year'].includes(event.target.value)
      ? event.target.value
      : 'open';
    setInvoiceScope(nextScope);
    if (docs.invoices.expanded) {
      loadDocSection('invoices', `/customers/${encodeURIComponent(id)}/invoices?scope=${encodeURIComponent(nextScope)}&year=${encodeURIComponent(invoiceYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        invoices: { ...prev.invoices, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.invoices.expanded, id, invoiceYear, loadDocSection]);

  const handleInvoiceYearChange = React.useCallback((event) => {
    const nextYear = Number(event.target.value) || CURRENT_YEAR;
    setInvoiceYear(nextYear);
    setInvoiceScope('year');
    if (docs.invoices.expanded) {
      loadDocSection('invoices', `/customers/${encodeURIComponent(id)}/invoices?scope=year&year=${encodeURIComponent(nextYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        invoices: { ...prev.invoices, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.invoices.expanded, id, loadDocSection]);

  const handleOfferScopeChange = React.useCallback((event) => {
    const nextScope = ['3m', '6m', 'year'].includes(event.target.value)
      ? event.target.value
      : '3m';
    setOfferScope(nextScope);
    if (docs.offers.expanded) {
      loadDocSection('offers', `/customers/${encodeURIComponent(id)}/offers?scope=${encodeURIComponent(nextScope)}&year=${encodeURIComponent(offerYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        offers: { ...prev.offers, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.offers.expanded, id, offerYear, loadDocSection]);

  const handleOfferYearChange = React.useCallback((event) => {
    const nextYear = Number(event.target.value) || CURRENT_YEAR;
    setOfferYear(nextYear);
    setOfferScope('year');
    if (docs.offers.expanded) {
      loadDocSection('offers', `/customers/${encodeURIComponent(id)}/offers?scope=year&year=${encodeURIComponent(nextYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        offers: { ...prev.offers, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.offers.expanded, id, loadDocSection]);

  const handleOrderScopeChange = React.useCallback((event) => {
    const nextScope = ['open', '3m', '6m', 'year'].includes(event.target.value)
      ? event.target.value
      : 'open';
    setOrderScope(nextScope);
    if (docs.orders.expanded) {
      loadDocSection('orders', `/customers/${encodeURIComponent(id)}/orders?scope=${encodeURIComponent(nextScope)}&year=${encodeURIComponent(orderYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        orders: { ...prev.orders, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.orders.expanded, id, loadDocSection, orderYear]);

  const handleOrderYearChange = React.useCallback((event) => {
    const nextYear = Number(event.target.value) || CURRENT_YEAR;
    setOrderYear(nextYear);
    setOrderScope('year');
    if (docs.orders.expanded) {
      loadDocSection('orders', `/customers/${encodeURIComponent(id)}/orders?scope=year&year=${encodeURIComponent(nextYear)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        orders: { ...prev.orders, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.orders.expanded, id, loadDocSection]);

  const toggleActivity = React.useCallback((activityId) => {
    setExpandedActivities((prev) => ({
      ...prev,
      [activityId]: !prev[activityId],
    }));
  }, []);

  const toggleRepresentative = React.useCallback((repKey) => {
    setExpandedRepresentatives((prev) => ({
      ...prev,
      [repKey]: !prev[repKey],
    }));
  }, []);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {name || String(id)}
        </Typography>
        <Button
          variant={isSelectedCustomer ? 'outlined' : 'contained'}
          size="small"
          sx={{ ml: 'auto', flexShrink: 0 }}
          disabled={!item || isSelectedCustomer}
          onClick={handleSelectCustomer}
        >
          {isSelectedCustomer ? t('selected_label') : t('select_label')}
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && item && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ pt: 2, minWidth: 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.75,
                mb: 1,
                color: creditLimit?.status === 'expired' ? 'error.main' : 'text.secondary',
              }}
            >
              <AccountBalanceWalletIcon fontSize="small" />
              <Typography variant="body2" sx={{ fontWeight: creditLimit?.status === 'expired' ? 600 : undefined }}>
                {creditLimitText}
              </Typography>
            </Box>

            <Accordion expanded={docs.offers.expanded} onChange={onToggleSection('offers', offerEndpoint)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, pr: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
                    {t('customer_docs_offers')}
                  </Typography>
                  {docs.offers.expanded && (
                    <Box
                      sx={{ ml: 'auto', minWidth: 0 }}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.stopPropagation()}
                    >
                      <DocumentScopeControls
                        t={t}
                        scope={offerScope}
                        year={offerYear}
                        onScopeChange={handleOfferScopeChange}
                        onYearChange={handleOfferYearChange}
                      />
                    </Box>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'grid', gap: 0.6, px: 1.25, py: 0.75 }}>
                {docs.offers.loading && <CircularProgress size={20} />}
                {docs.offers.error && <Alert severity="error">{docs.offers.error}</Alert>}
                {!docs.offers.loading && !docs.offers.error && docs.offers.items.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_offers')}</Typography>
                )}
                {!docs.offers.loading && !docs.offers.error && docs.offers.items.map((offer, idx) => (
                  <Card key={`${offer.id || idx}-offer`} variant="outlined">
                    <CardContent sx={{ py: '8px !important', px: '10px !important', display: 'grid', gap: 0.25 }}>
                      <Typography variant="caption">{t('contact_label')}: {offer.contact || '-'}</Typography>
                      <Typography variant="caption">{t('offer_date_label')}: {formatDateOnly(offer.offerDate)}</Typography>
                      <Typography variant="caption">{t('payment_terms_label')}: {offer.paymentText || '-'}</Typography>
                      {(Array.isArray(offer.positions) ? offer.positions : []).map((pos, pIdx) => (
                        <Typography key={`${offer.id || idx}-pos-${pIdx}`} variant="caption" sx={{ lineHeight: 1.2 }}>
                          {`${pIdx + 1}. ${pos.article || '-'}; ${pos.amount ?? '-'} ${pos.unit || ''}; ${formatMoney(pos.offeredPrice)}`}
                        </Typography>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </AccordionDetails>
            </Accordion>

            <Accordion expanded={docs.orders.expanded} onChange={onToggleSection('orders', orderEndpoint)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, pr: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
                    {t('customer_docs_orders')}
                  </Typography>
                  {docs.orders.expanded && (
                    <Box
                      sx={{ ml: 'auto', minWidth: 0 }}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.stopPropagation()}
                    >
                      <DocumentScopeControls
                        t={t}
                        scope={orderScope}
                        year={orderYear}
                        includeOpen
                        onScopeChange={handleOrderScopeChange}
                        onYearChange={handleOrderYearChange}
                      />
                    </Box>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'grid', gap: 0.6, px: 1.25, py: 0.75 }}>
                {docs.orders.loading && <CircularProgress size={20} />}
                {docs.orders.error && <Alert severity="error">{docs.orders.error}</Alert>}
                {!docs.orders.loading && !docs.orders.error && docs.orders.items.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_orders')}</Typography>
                )}
                {!docs.orders.loading && !docs.orders.error && docs.orders.items.map((order, idx) => (
                  <Card key={`${order.id || idx}-order`} variant="outlined">
                    <CardContent sx={{ py: '8px !important', px: '10px !important', display: 'grid', gap: 0.25 }}>
                      <Typography variant="caption">{t('contact_label')}: {order.contact || '-'}</Typography>
                      <Typography variant="caption">{t('order_date_label')}: {formatDateOnly(order.orderDate)}</Typography>
                      <Typography variant="caption">{t('due_date_label')}: {formatDateOnly(order.dueDate)}</Typography>
                      <Typography variant="caption">{t('payment_terms_label')}: {order.paymentText || '-'}</Typography>
                      {(Array.isArray(order.positions) ? order.positions : []).map((pos, pIdx) => (
                        <Typography key={`${order.id || idx}-pos-${pIdx}`} variant="caption" sx={{ lineHeight: 1.2 }}>
                          {`${pIdx + 1}. ${pos.article || '-'}; ${pos.amount ?? '-'} ${pos.unit || ''}; ${formatDateOnly(pos.deliveryDate)}; ${t('order_sale_price_per_tonne')}: ${formatMoney(pos.salePricePerTonne)}`}
                        </Typography>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </AccordionDetails>
            </Accordion>

            <Accordion expanded={docs.invoices.expanded} onChange={onToggleSection('invoices', invoiceEndpoint)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, pr: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
                    {t('customer_docs_invoices')}
                  </Typography>
                  {docs.invoices.expanded && (
                    <Box
                      sx={{ ml: 'auto', minWidth: 0 }}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.stopPropagation()}
                    >
                      <DocumentScopeControls
                        t={t}
                        scope={invoiceScope}
                        year={invoiceYear}
                        includeOpen
                        onScopeChange={handleInvoiceScopeChange}
                        onYearChange={handleInvoiceYearChange}
                      />
                    </Box>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'grid', gap: 0.6, px: 1.25, py: 0.75 }}>
                {docs.invoices.loading && <CircularProgress size={20} />}
                {docs.invoices.error && <Alert severity="error">{docs.invoices.error}</Alert>}
                {!docs.invoices.loading && !docs.invoices.error && docs.invoices.items.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_invoices')}</Typography>
                )}
                {!docs.invoices.loading && !docs.invoices.error && docs.invoices.items.map((invoice, idx) => (
                  <Card key={`${invoice.id || idx}-invoice`} variant="outlined">
                    <CardContent sx={{ py: '8px !important', px: '10px !important', display: 'grid', gap: 0.25 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {t('invoice_number_label')}: {invoice.invoiceNumber || '-'}
                      </Typography>
                      <Typography variant="caption">{t('invoice_date_label')}: {formatDateOnly(invoice.invoiceDate)}</Typography>
                      <Typography variant="caption">{t('due_date_label')}: {formatDateOnly(invoice.dueDate)}</Typography>
                      <Typography variant="caption">{t('payment_terms_label')}: {invoice.paymentText || '-'}</Typography>
                      <Typography variant="caption">
                        {t('amount_label')}: {formatMoney(invoice.amount)} (
                        <Box
                          component="span"
                          sx={invoice.isPaid ? { color: 'success.main', fontWeight: 700 } : undefined}
                        >
                          {invoice.isPaid ? t('invoice_status_paid') : t('invoice_status_open')}
                        </Box>
                        )
                      </Typography>
                      {invoice.reminderStageText && (
                        <Typography
                          variant="caption"
                          sx={{ color: 'error.main', fontWeight: 600 }}
                        >
                          {t('reminder_stage_label')}: {invoice.reminderStageText}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </AccordionDetails>
            </Accordion>

            <Accordion expanded={docs.purchasedArticles.expanded} onChange={onToggleSection('purchasedArticles', purchasedArticlesEndpoint)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, pr: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ minWidth: 0 }}>
                    {t('customer_docs_purchased_articles')}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'grid', gap: 0.75, px: 1.25, py: 0.75 }}>
                <TextField
                  fullWidth
                  size="small"
                  value={purchasedArticlesQuery}
                  onChange={(event) => setPurchasedArticlesQuery(event.target.value)}
                  placeholder={t('customer_docs_purchased_articles_search')}
                />
                {docs.purchasedArticles.loading && <CircularProgress size={20} />}
                {docs.purchasedArticles.error && <Alert severity="error">{docs.purchasedArticles.error}</Alert>}
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticleGroups.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_purchased_articles')}</Typography>
                )}
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticleGroups.map((group, groupIdx) => (
                  <Box key={group.id || group.key || `${group.name}-${groupIdx}`} sx={{ display: 'grid', gap: 0.45 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: groupIdx ? 0.45 : 0 }}>
                      {group.name || '-'}
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 0.6, pl: 1 }}>
                      {(Array.isArray(group.articles) ? group.articles : []).map((article, idx) => (
                        <Card
                          key={article.id || `${article.article}-${idx}`}
                          variant="outlined"
                          sx={article.productId ? { cursor: 'pointer' } : undefined}
                          onClick={article.productId
                            ? () => navigate(`/products/${encodeURIComponent(article.productId)}`, {
                              state: {
                                fromCustomer: {
                                  id,
                                  name,
                                  address,
                                  representative: salesRep,
                                },
                              },
                            })
                            : undefined}
                        >
                          <CardContent sx={{ py: '6px !important', px: '10px !important' }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: '0.84rem',
                                ...(article.productId ? { color: 'primary.main', textDecoration: 'underline' } : {}),
                              }}
                            >
                              {article.article || '-'}
                            </Typography>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>

            <Divider sx={{ my: 3 }} />

            {reminderInvoicesCount > 0 && (
              <>
                <Typography sx={{ color: 'error.main', fontWeight: 700, mb: 3, whiteSpace: 'pre-line' }}>
                  {t('customer_reminder_warning', { count: reminderInvoicesCount })}
                </Typography>
                <Divider sx={{ my: 3 }} />
              </>
            )}

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              {t('desc_label')}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {description || '-'}
            </Typography>

            <Divider sx={{ my: 3 }} />

            <InfoRow
              icon={<MapIcon fontSize="small" />}
              label={t('address_label')}
              value={address || '-'}
              onClick={addressForMap ? handleAddressClick : undefined}
              forceRight
            />
            <InfoRow
              icon={<MapIcon fontSize="small" />}
              label={t('homepage_label')}
              value={homepageRaw || '-'}
              link={homepageLink || undefined}
              forceRight
            />

            <Divider sx={{ my: 3 }} />
            <CompactInfoRow
              icon={<PersonIcon fontSize="small" />}
              label={t('sales_rep_label')}
              value={salesRep || '-'}
            />

            {representatives.length > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.75 }}>
                  {t('contact_label')}
                </Typography>
                {representatives.map((rep, index) => (
                  <React.Fragment key={rep.key}>
                    <Card
                      variant="outlined"
                      sx={{ cursor: 'pointer' }}
                      onClick={() => toggleRepresentative(rep.key)}
                    >
                      <CardContent sx={{ py: '8px !important', px: '10px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <PersonIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
                            {rep.name || '-'}
                          </Typography>
                          <ChevronRightIcon
                            fontSize="small"
                            sx={{
                              color: 'text.secondary',
                              transform: expandedRepresentatives[rep.key] ? 'rotate(270deg)' : 'rotate(90deg)',
                              transition: 'transform 160ms ease',
                            }}
                          />
                        </Box>
                        {expandedRepresentatives[rep.key] && (
                          <Box sx={{ mt: 1 }}>
                            {rep.phone && (
                              <InfoRow
                                icon={<PhoneIcon fontSize="small" />}
                                label={t('phone_label')}
                                value={rep.phone}
                                link={`tel:${rep.phone}`}
                              />
                            )}
                            {rep.email && (
                              <InfoRow
                                icon={<EmailIcon fontSize="small" />}
                                label={t('email_label')}
                                value={rep.email}
                                link={`mailto:${rep.email}`}
                              />
                            )}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                    {index < representatives.length - 1 && <Box sx={{ height: 8 }} />}
                  </React.Fragment>
                ))}
              </>
            )}

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.75 }}>
              {t('activities_label')}
            </Typography>
            {activities.length === 0 ? (
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                -
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.75 }}>
                {activities.map((activity) => {
                  const isExpanded = Boolean(expandedActivities[activity.id]);
                  const text = String(activity.text || '');
                  return (
                    <Card
                      key={activity.id}
                      variant="outlined"
                      sx={{ cursor: 'pointer' }}
                      onClick={() => toggleActivity(activity.id)}
                    >
                      <CardContent sx={{ py: '8px !important', px: '10px !important', display: 'grid', gap: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateOnly(activity.noteDate)}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: '0.85rem' }}
                        >
                          {isExpanded ? text : truncateActivityText(text)}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={mapChoiceOpen} onClose={() => setMapChoiceOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('navigation_choose_title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('navigation_choose_text')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMapChoiceOpen(false)}>{t('back_label')}</Button>
          <Button onClick={() => chooseMapProvider(MAP_PROVIDER_GOOGLE)}>
            {t('navigation_google_maps')}
          </Button>
          <Button variant="contained" onClick={() => chooseMapProvider(MAP_PROVIDER_APPLE)}>
            {t('navigation_apple_maps')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

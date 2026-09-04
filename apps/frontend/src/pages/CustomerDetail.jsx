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
  Checkbox,
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
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import {
  CUSTOMER_SELECTION_CHANGED,
  getSelectedCustomer,
  setSelectedCustomer,
} from '../utils/customerSelection.js';
import { addOrderCartItem } from '../utils/orderCart.js';
import WpzCommentField from '../components/WpzCommentField.jsx';
import SaleMarginHint from '../components/SaleMarginHint.jsx';
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

function formatQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

function getPositionLabel(count, t) {
  return Number(count) === 1 ? t('position_singular') : t('position_plural');
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
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
        justifyContent: 'flex-start',
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

function DocumentAccordionSummary({ title, controls }) {
  return (
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      sx={{
        alignItems: 'flex-start',
        '& .MuiAccordionSummary-content': {
          my: 0.75,
          minWidth: 0,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          width: '100%',
          minWidth: 0,
          pr: 0.5,
        }}
      >
        <Typography variant="subtitle1" sx={{ minWidth: 0, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {controls && (
          <Box
            sx={{ alignSelf: 'flex-start', minWidth: 0 }}
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.stopPropagation()}
          >
            {controls}
          </Box>
        )}
      </Box>
    </AccordionSummary>
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
  const [activityScope, setActivityScope] = React.useState('3m');
  const [activityYear, setActivityYear] = React.useState(CURRENT_YEAR);
  const [activities, setActivities] = React.useState([]);
  const [activitiesLoading, setActivitiesLoading] = React.useState(false);
  const [activitiesError, setActivitiesError] = React.useState('');
  const [purchasedArticlesQuery, setPurchasedArticlesQuery] = React.useState('');
  const [mapChoiceOpen, setMapChoiceOpen] = React.useState(false);
  const [expandedActivities, setExpandedActivities] = React.useState({});
  const [expandedRepresentatives, setExpandedRepresentatives] = React.useState({});
  const [expandedPurchasedArticleGroups, setExpandedPurchasedArticleGroups] = React.useState({});
  const [expandedPurchasedHistoryGroups, setExpandedPurchasedHistoryGroups] = React.useState({});
  const [selectedPurchasedPositionIds, setSelectedPurchasedPositionIds] = React.useState([]);
  const [batchCartOpen, setBatchCartOpen] = React.useState(false);
  const [batchCartError, setBatchCartError] = React.useState('');
  const [batchCartSuccess, setBatchCartSuccess] = React.useState('');
  const [batchCartSalePrice, setBatchCartSalePrice] = React.useState('');
  const [batchCartDeliveryDate, setBatchCartDeliveryDate] = React.useState(tomorrow);
  const [batchCartQuantities, setBatchCartQuantities] = React.useState({});
  const [batchCartWpzIds, setBatchCartWpzIds] = React.useState({});
  const [batchCartWpzLoading, setBatchCartWpzLoading] = React.useState(false);
  const [batchCartWpzOriginal, setBatchCartWpzOriginal] = React.useState(false);
  const [batchCartWpzComment, setBatchCartWpzComment] = React.useState('Neutralisieren');
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
        const res = await apiRequest(`/customers/${encodeURIComponent(id)}?includeActivities=0`);
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
  const availableCreditAmount = Number(creditLimit?.availableAmount);
  const hasAvailableCredit = creditLimit?.status === 'active' && Number.isFinite(availableCreditAmount);
  const openOrdersAmount = Number(creditLimit?.openOrdersAmount);
  const hasOpenOrdersAmount = Boolean(creditLimit) && Number.isFinite(openOrdersAmount);
  const availableCreditColor = availableCreditAmount > 0
    ? 'success.main'
    : availableCreditAmount < 0
      ? 'error.main'
      : 'text.secondary';
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
  const activitiesEndpoint = `/customers/${encodeURIComponent(id)}/activities?scope=${encodeURIComponent(activityScope)}&year=${encodeURIComponent(activityYear)}`;
  const purchasedArticlesEndpoint = `/customers/${encodeURIComponent(id)}/purchased-articles`;

  React.useEffect(() => {
    let alive = true;
    setActivitiesLoading(true);
    setActivitiesError('');

    (async () => {
      try {
        const res = await apiRequest(activitiesEndpoint);
        if (!alive) return;
        setActivities(Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        if (!alive) return;
        setActivitiesError(e?.message || t('loading_error'));
      } finally {
        if (alive) setActivitiesLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [activitiesEndpoint, t]);
  const filteredPurchasedArticleGroups = React.useMemo(() => {
    const query = String(purchasedArticlesQuery || '').trim().toLowerCase();
    const groups = Array.isArray(docs.purchasedArticles.items) ? docs.purchasedArticles.items : [];
    if (!query) return groups;
    return groups
      .map((group) => {
        const groupMatches = String(group?.name || '').toLowerCase().includes(query);
        const articles = Array.isArray(group?.articles) ? group.articles : [];
        const availablePositions = Array.isArray(group?.availablePositions) ? group.availablePositions : [];
        return {
          ...group,
          articles: groupMatches
            ? articles
            : articles.filter((itemRow) => String(itemRow?.article || '').toLowerCase().includes(query)),
          availablePositions: groupMatches
            ? availablePositions
            : availablePositions.filter((position) => (
              [position?.article, position?.warehouse, position?.warehouseId, position?.beNumber]
                .some((value) => String(value || '').toLowerCase().includes(query))
            )),
        };
      })
      .filter((group) => group.articles.length > 0 || group.availablePositions.length > 0);
  }, [docs.purchasedArticles.items, purchasedArticlesQuery]);

  const allPurchasedAvailablePositions = React.useMemo(() => (
    (Array.isArray(docs.purchasedArticles.items) ? docs.purchasedArticles.items : [])
      .flatMap((group) => (Array.isArray(group?.availablePositions) ? group.availablePositions : []))
  ), [docs.purchasedArticles.items]);

  const selectedPurchasedPositions = React.useMemo(() => {
    const selected = new Set(selectedPurchasedPositionIds);
    return allPurchasedAvailablePositions.filter((position) => selected.has(position.id || position.productId));
  }, [allPurchasedAvailablePositions, selectedPurchasedPositionIds]);

  const selectedPurchasedPositionCount = selectedPurchasedPositions.length;
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

  const handleActivityScopeChange = React.useCallback((event) => {
    const nextScope = ['3m', '6m', 'year'].includes(event.target.value)
      ? event.target.value
      : '3m';
    setActivityScope(nextScope);
  }, []);

  const handleActivityYearChange = React.useCallback((event) => {
    const nextYear = Number(event.target.value) || CURRENT_YEAR;
    setActivityYear(nextYear);
    setActivityScope('year');
  }, []);

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

  const togglePurchasedArticleGroup = React.useCallback((groupKey) => {
    setExpandedPurchasedArticleGroups((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] !== true,
    }));
  }, []);

  const togglePurchasedHistoryGroup = React.useCallback((groupKey) => {
    setExpandedPurchasedHistoryGroups((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] !== true,
    }));
  }, []);

  const togglePurchasedPosition = React.useCallback((positionId) => {
    const key = String(positionId || '');
    if (!key) return;
    setSelectedPurchasedPositionIds((previous) => (
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key]
    ));
    setBatchCartSuccess('');
  }, []);

  const setPurchasedGroupSelection = React.useCallback((positions, selected) => {
    const ids = positions
      .map((position) => String(position?.id || position?.productId || '').trim())
      .filter(Boolean);
    setSelectedPurchasedPositionIds((previous) => {
      const next = new Set(previous);
      ids.forEach((idValue) => {
        if (selected) next.add(idValue);
        else next.delete(idValue);
      });
      return Array.from(next);
    });
    setBatchCartSuccess('');
  }, []);

  const openBatchCartDialog = React.useCallback(async () => {
    if (!selectedPurchasedPositions.length) return;

    const quantities = {};
    selectedPurchasedPositions.forEach((position) => {
      const available = Math.max(Number(position.amount || 0) - Number(position.reserved || 0), 0);
      quantities[position.id || position.productId] = available;
    });
    setBatchCartQuantities(quantities);
    setBatchCartSalePrice('');
    setBatchCartDeliveryDate(tomorrow());
    setBatchCartWpzOriginal(false);
    setBatchCartWpzComment('Neutralisieren');
    setBatchCartError('');
    setBatchCartSuccess('');
    setBatchCartWpzIds({});
    setBatchCartOpen(true);
    setBatchCartWpzLoading(true);

    const wpzEntries = await Promise.all(selectedPurchasedPositions.map(async (position) => {
      const key = position.id || position.productId;
      try {
        const response = await apiRequest(`/products/${encodeURIComponent(position.productId || position.id)}/wpz`);
        const wpzId = Number(response?.data?.wpzId);
        return [key, Number.isFinite(wpzId) && wpzId > 0 ? wpzId : null];
      } catch {
        return [key, null];
      }
    }));
    setBatchCartWpzIds(Object.fromEntries(wpzEntries));
    setBatchCartWpzLoading(false);
  }, [selectedPurchasedPositions]);

  const addSelectedPositionsToCart = React.useCallback(() => {
    if (!selectedPurchasedPositions.length) return;

    const salePrice = Number(batchCartSalePrice);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      setBatchCartError(t('validation_sale_price_positive'));
      return;
    }
    if (!String(batchCartDeliveryDate || '').trim()) {
      setBatchCartError(t('validation_delivery_date_required'));
      return;
    }
    if (batchCartWpzLoading) {
      setBatchCartError(t('purchased_batch_waiting_for_wpz'));
      return;
    }

    for (const position of selectedPurchasedPositions) {
      const key = position.id || position.productId;
      const quantity = Number(batchCartQuantities[key]);
      const available = Math.max(Number(position.amount || 0) - Number(position.reserved || 0), 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setBatchCartError(`${position.article || position.beNumber}: ${t('validation_cart_quantity_positive')}`);
        return;
      }
      if (quantity > available) {
        setBatchCartError(`${position.article || position.beNumber}: ${t('validation_cart_quantity_not_above_available')}`);
        return;
      }
    }

    const selectedCount = selectedPurchasedPositions.length;
    selectedPurchasedPositions.forEach((position) => {
      const key = position.id || position.productId;
      const wpzId = batchCartWpzIds[key] || null;
      addOrderCartItem({
        ...position,
        id: position.productId || position.id,
        storageId: position.warehouseId,
        salePrice,
        deliveryDate: batchCartDeliveryDate,
        wpzId,
        wpzOriginal: wpzId ? batchCartWpzOriginal : null,
        wpzComment: batchCartWpzComment || '',
      }, Number(batchCartQuantities[key]));
    });

    setSelectedPurchasedPositionIds((previous) => previous.filter(
      (idValue) => !selectedPurchasedPositions.some((position) => (position.id || position.productId) === idValue),
    ));
    setBatchCartOpen(false);
    setBatchCartError('');
    setBatchCartSuccess(t('purchased_batch_success', {
      count: selectedCount,
      positionLabel: getPositionLabel(selectedCount, t),
    }));
  }, [batchCartDeliveryDate, batchCartQuantities, batchCartSalePrice, batchCartWpzComment, batchCartWpzIds, batchCartWpzLoading, batchCartWpzOriginal, selectedPurchasedPositions, t]);

  React.useEffect(() => {
    setExpandedPurchasedArticleGroups({});
    setExpandedPurchasedHistoryGroups({});
    setSelectedPurchasedPositionIds([]);
    setBatchCartSuccess('');
  }, [id]);

  const navigateToPurchasedProduct = React.useCallback((productId) => {
    if (!productId) return;
    navigate(`/products/${encodeURIComponent(productId)}`, {
      state: {
        fromCustomer: {
          id,
          name,
          address,
          representative: salesRep,
        },
      },
    });
  }, [address, id, name, navigate, salesRep]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', minWidth: 0, overflowX: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={handleBack} sx={{ mt: 0.25 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          {!loading && !error && item && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                columnGap: 2,
                minWidth: 0,
                py: 0.75,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', minWidth: 0 }}>
                <PersonIcon fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  {t('sales_rep_label')}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: 0 }}>
                {salesRep || '-'}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {name || String(id)}
            </Typography>
            <Button
              variant={isSelectedCustomer ? 'outlined' : 'contained'}
              size="small"
              sx={{ flexShrink: 0 }}
              disabled={!item || isSelectedCustomer}
              onClick={handleSelectCustomer}
            >
              {isSelectedCustomer ? t('selected_label') : t('select_label')}
            </Button>
          </Box>
        </Box>
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
            <Box sx={{ mb: 1 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  columnGap: 2,
                  py: 0.75,
                  color: creditLimit?.status === 'expired' ? 'error.main' : 'text.secondary',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <AccountBalanceWalletIcon fontSize="small" />
                  <Typography
                    variant="body2"
                    sx={{
                      minWidth: 0,
                      fontWeight: creditLimit?.status === 'expired' ? 600 : undefined,
                    }}
                  >
                    {creditLimitText}
                  </Typography>
                </Box>
                {hasAvailableCredit && (
                  <Typography
                    variant="body2"
                    sx={{ color: availableCreditColor, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'right' }}
                  >
                    {t('credit_limit_available', { amount: formatEuro(availableCreditAmount) })}
                  </Typography>
                )}
              </Box>
              {hasOpenOrdersAmount && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    columnGap: 2,
                    ml: 4,
                    mt: 0.25,
                    color: 'text.secondary',
                  }}
                >
                  <Typography variant="body2">
                    {t('credit_limit_open_orders_label')}:
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {formatEuro(openOrdersAmount)}
                  </Typography>
                </Box>
              )}
            </Box>

            <Accordion expanded={docs.offers.expanded} onChange={onToggleSection('offers', offerEndpoint)}>
              <DocumentAccordionSummary
                title={t('customer_docs_offers')}
                controls={docs.offers.expanded && (
                  <DocumentScopeControls
                    t={t}
                    scope={offerScope}
                    year={offerYear}
                    onScopeChange={handleOfferScopeChange}
                    onYearChange={handleOfferYearChange}
                  />
                )}
              />
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
              <DocumentAccordionSummary
                title={t('customer_docs_orders')}
                controls={docs.orders.expanded && (
                  <DocumentScopeControls
                    t={t}
                    scope={orderScope}
                    year={orderYear}
                    includeOpen
                    onScopeChange={handleOrderScopeChange}
                    onYearChange={handleOrderYearChange}
                  />
                )}
              />
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
              <DocumentAccordionSummary
                title={t('customer_docs_invoices')}
                controls={docs.invoices.expanded && (
                  <DocumentScopeControls
                    t={t}
                    scope={invoiceScope}
                    year={invoiceYear}
                    includeOpen
                    onScopeChange={handleInvoiceScopeChange}
                    onYearChange={handleInvoiceYearChange}
                  />
                )}
              />
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
                {batchCartSuccess && (
                  <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
                    {batchCartSuccess}
                  </Typography>
                )}
                {selectedPurchasedPositionCount > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      {t('purchased_batch_selected', {
                        count: selectedPurchasedPositionCount,
                        positionLabel: getPositionLabel(selectedPurchasedPositionCount, t),
                      })}
                    </Typography>
                  </Box>
                )}
                {docs.purchasedArticles.loading && <CircularProgress size={20} />}
                {docs.purchasedArticles.error && <Alert severity="error">{docs.purchasedArticles.error}</Alert>}
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticleGroups.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_purchased_articles')}</Typography>
                )}
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticleGroups.map((group, groupIdx) => (
                  (() => {
                    const groupKey = group.id || group.key || `${group.name}-${groupIdx}`;
                    const articles = Array.isArray(group.articles) ? group.articles : [];
                    const availablePositions = Array.isArray(group.availablePositions) ? group.availablePositions : [];
                    const availableArticleKeys = new Set(
                      availablePositions.map((position) => `${position.articleIndex || ''}\u0000${position.article || ''}`),
                    );
                    const historicalArticles = articles.filter((article) => (
                      !availableArticleKeys.has(`${article.articleIndex || ''}\u0000${article.article || ''}`)
                    ));
                    const selectedInGroup = availablePositions.filter((position) => (
                      selectedPurchasedPositionIds.includes(position.id || position.productId)
                    ));
                    const allGroupPositionsSelected = availablePositions.length > 0
                      && selectedInGroup.length === availablePositions.length;
                    const isExpanded = purchasedArticlesQuery.trim() !== ''
                      || expandedPurchasedArticleGroups[groupKey] === true;
                    const isHistoryExpanded = expandedPurchasedHistoryGroups[groupKey] === true;

                    return (
                      <Box key={groupKey} sx={{ display: 'grid', gap: 0.45 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            mt: groupIdx ? 0.45 : 0,
                            minWidth: 0,
                            cursor: 'pointer',
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={() => togglePurchasedArticleGroup(groupKey)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              togglePurchasedArticleGroup(groupKey);
                            }
                          }}
                        >
                          <IconButton
                            size="small"
                            aria-label={isExpanded ? 'Produkte einklappen' : 'Produkte ausklappen'}
                            aria-expanded={isExpanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePurchasedArticleGroup(groupKey);
                            }}
                            sx={{ p: 0.25, color: 'text.secondary' }}
                          >
                            <ChevronRightIcon
                              fontSize="small"
                              sx={{
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 160ms ease',
                              }}
                            />
                          </IconButton>
                          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ minWidth: 0, fontWeight: 600 }}>
                              {group.name || '-'}
                            </Typography>
                            {availablePositions.length > 0 && (
                              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                                {t('purchased_available_count', {
                                  count: availablePositions.length,
                                  positionLabel: getPositionLabel(availablePositions.length, t),
                                })}
                              </Typography>
                            )}
                            {selectedInGroup.length > 0 && (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {t('purchased_batch_selected_short', { count: selectedInGroup.length })}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        {isExpanded && (
                          <Box sx={{ display: 'grid', gap: 0.6, pl: 1 }}>
                            {availablePositions.length > 0 && (
                              <Box sx={{ display: 'grid', gap: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                    {t('purchased_available_heading')}
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                    <Button
                                      size="small"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setPurchasedGroupSelection(availablePositions, !allGroupPositionsSelected);
                                      }}
                                    >
                                      {allGroupPositionsSelected
                                        ? t('purchased_clear_selection')
                                        : t('purchased_select_all')}
                                    </Button>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      aria-label={t('purchased_batch_add_selected')}
                                      title={t('purchased_batch_add_selected')}
                                      disabled={selectedPurchasedPositionCount === 0}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openBatchCartDialog();
                                      }}
                                    >
                                      <ShoppingCartIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                </Box>
                                {availablePositions.map((position) => {
                                  const positionId = position.id || position.productId;
                                  const selected = selectedPurchasedPositionIds.includes(positionId);
                                  const availableAmount = Math.max(
                                    Number(position.amount || 0) - Number(position.reserved || 0),
                                    0,
                                  );
                                  return (
                                    <Card
                                      key={positionId}
                                      variant="outlined"
                                      sx={selected ? { borderColor: 'primary.main', bgcolor: 'action.selected' } : undefined}
                                    >
                                      <CardContent sx={{ py: '5px !important', px: '8px !important' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                                          <Checkbox
                                            size="small"
                                            checked={selected}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={() => togglePurchasedPosition(positionId)}
                                            inputProps={{ 'aria-label': `${position.article || '-'} ${position.beNumber || ''}`.trim() }}
                                          />
                                          <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontSize: '0.84rem', overflowWrap: 'anywhere' }}>
                                              {position.article || '-'}
                                            </Typography>
                                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere' }}>
                                              {`${formatQuantity(availableAmount)} ${position.unit || 'kg'} · ${position.warehouse || position.warehouseId || '-'} · ${t('product_be_number')}: ${position.beNumber || '-'}`}
                                            </Typography>
                                          </Box>
                                          {position.productId && (
                                            <Button
                                              size="small"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                navigateToPurchasedProduct(position.productId);
                                              }}
                                            >
                                              {t('purchased_batch_details')}
                                            </Button>
                                          )}
                                        </Box>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </Box>
                            )}
                            {historicalArticles.length > 0 && (
                              <Box sx={{ display: 'grid', gap: 0.5 }}>
                                <Box
                                  sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer' }}
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={isHistoryExpanded}
                                  onClick={() => togglePurchasedHistoryGroup(groupKey)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      togglePurchasedHistoryGroup(groupKey);
                                    }
                                  }}
                                >
                                  <IconButton
                                    size="small"
                                    aria-label={isHistoryExpanded
                                      ? t('purchased_history_collapse')
                                      : t('purchased_history_expand')}
                                    sx={{ p: 0.25, color: 'text.secondary' }}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      togglePurchasedHistoryGroup(groupKey);
                                    }}
                                  >
                                    <ChevronRightIcon
                                      fontSize="small"
                                      sx={{
                                        transform: isHistoryExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                        transition: 'transform 160ms ease',
                                      }}
                                    />
                                  </IconButton>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                    {t('purchased_history_heading')}
                                  </Typography>
                                </Box>
                                {isHistoryExpanded && historicalArticles.map((article, idx) => (
                                  <Card
                                    key={article.id || `${article.article}-${idx}`}
                                    variant="outlined"
                                    sx={article.productId ? { cursor: 'pointer' } : undefined}
                                    onClick={article.productId
                                      ? () => navigateToPurchasedProduct(article.productId)
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
                            )}
                          </Box>
                        )}
                      </Box>
                    );
                  })()
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

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, minWidth: 0 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ minWidth: 0 }}>
                {t('activities_label')}
              </Typography>
              <Box
                sx={{ ml: 'auto', minWidth: 0 }}
                onClick={(event) => event.stopPropagation()}
                onFocus={(event) => event.stopPropagation()}
              >
                <DocumentScopeControls
                  t={t}
                  scope={activityScope}
                  year={activityYear}
                  onScopeChange={handleActivityScopeChange}
                  onYearChange={handleActivityYearChange}
                />
              </Box>
            </Box>
            {activitiesLoading && <CircularProgress size={20} />}
            {activitiesError && <Alert severity="error">{activitiesError}</Alert>}
            {!activitiesLoading && !activitiesError && activities.length === 0 ? (
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                -
              </Typography>
            ) : !activitiesLoading && !activitiesError ? (
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
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={batchCartOpen} onClose={() => setBatchCartOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>
          {t('purchased_batch_title', {
            count: selectedPurchasedPositionCount,
            positionLabel: getPositionLabel(selectedPurchasedPositionCount, t),
          })}
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          {batchCartError && <Alert severity="error">{batchCartError}</Alert>}
          <TextField
            type="number"
            label={t('purchased_batch_global_price')}
            value={batchCartSalePrice}
            onChange={(event) => setBatchCartSalePrice(event.target.value)}
            inputProps={{ min: 0.01, step: 'any' }}
            fullWidth
            required
          />
          <TextField
            type="date"
            label={t('purchased_batch_global_date')}
            value={batchCartDeliveryDate}
            onChange={(event) => setBatchCartDeliveryDate(event.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
          />
          {batchCartWpzLoading && <CircularProgress size={20} />}
          {!batchCartWpzLoading && Object.values(batchCartWpzIds).some(Boolean) && (
            <WpzCommentField
              wpzId={Object.values(batchCartWpzIds).find(Boolean) || null}
              wpzOriginal={batchCartWpzOriginal}
              wpzComment={batchCartWpzComment}
              onChange={({ wpzOriginal, wpzComment }) => {
                setBatchCartWpzOriginal(wpzOriginal);
                setBatchCartWpzComment(wpzComment);
              }}
            />
          )}
          {!batchCartWpzLoading && !Object.values(batchCartWpzIds).some(Boolean) && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('purchased_batch_wpz_none')}
            </Typography>
          )}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {t('purchased_batch_quantity_hint')}
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.75 }}>
            {selectedPurchasedPositions.map((position) => {
              const positionId = position.id || position.productId;
              const availableAmount = Math.max(
                Number(position.amount || 0) - Number(position.reserved || 0),
                0,
              );
              return (
                <Card key={positionId} variant="outlined">
                  <CardContent sx={{ display: 'grid', gap: 0.75, py: '8px !important', px: '10px !important' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                      {position.article || '-'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                      {`${position.warehouse || position.warehouseId || '-'} · ${t('product_be_number')}: ${position.beNumber || '-'} · ${t('product_available_now')}: ${formatQuantity(availableAmount)} ${position.unit || 'kg'}`}
                    </Typography>
                    <TextField
                      type="number"
                      label={t('purchased_batch_quantity')}
                      value={batchCartQuantities[positionId] ?? ''}
                      onChange={(event) => setBatchCartQuantities((previous) => ({
                        ...previous,
                        [positionId]: event.target.value,
                      }))}
                      inputProps={{ min: 1, max: availableAmount, step: 'any' }}
                      size="small"
                      fullWidth
                    />
                    <SaleMarginHint
                      salePrice={batchCartSalePrice}
                      costPrice={position.acquisitionPrice}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchCartOpen(false)}>{t('back_label')}</Button>
          <Button variant="contained" onClick={addSelectedPositionsToCart} disabled={batchCartWpzLoading}>
            {t('purchased_batch_add_selected')}
          </Button>
        </DialogActions>
      </Dialog>

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

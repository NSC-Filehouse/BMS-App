import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { getDefaultContactName, normalizeContactRanking } from '../utils/contactRanking.js';
import { getMandant } from '../utils/mandant.js';
import { findForeignMandantName } from '../utils/mandantPrefix.js';
import { clearOrderCart } from '../utils/orderCart.js';
import WpzCommentField from '../components/WpzCommentField.jsx';
import SaleMarginHint from '../components/SaleMarginHint.jsx';
import ExpandCollapseIndicator from '../components/ExpandCollapseIndicator.jsx';
import DeliveryDateHint from '../components/DeliveryDateHint.jsx';
import { normalizeWpzFields } from '../utils/wpz.js';
import { getWeekendStatus, nextWeekday } from '../utils/deliveryDate.js';
import { isTempOrderEditableStatus, normalizeTempOrderStatus } from '../utils/tempOrderStatus.js';
import { calculatePositionSplit, splitPositionValues } from '../utils/positionSplit.js';
import {
  getSelectedCustomer as getStoredSelectedCustomer,
  setSelectedCustomer as storeSelectedCustomer,
  clearSelectedCustomer as clearStoredSelectedCustomer,
} from '../utils/customerSelection.js';

function buildAddress(row) {
  const street = row?.kd_Strasse ? String(row.kd_Strasse).trim() : '';
  const plz = row?.kd_PLZ ? String(row.kd_PLZ).trim() : '';
  const ort = row?.kd_Ort ? String(row.kd_Ort).trim() : '';
  const lk = row?.kd_LK ? String(row.kd_LK).trim() : '';
  return [street, [plz, ort].filter(Boolean).join(' '), lk].filter(Boolean).join(', ');
}

function normalizeRepresentativeOptions(representatives, preferredName = '') {
  const options = (Array.isArray(representatives) ? representatives : [])
    .map((representative) => ({
      id: representative?.id ?? null,
      name: String(representative?.name || '').trim(),
      position: String(representative?.position || '').trim(),
      email: String(representative?.email || '').trim(),
      ranking: normalizeContactRanking(representative?.ranking),
    }))
    .filter((representative) => representative.name);
  const preferred = String(preferredName || '').trim();
  if (preferred && !options.some((representative) => representative.name === preferred)) {
    options.unshift({ id: null, name: preferred, position: '', email: '', ranking: null });
  }
  return options;
}

function findDefaultIncoterm(options) {
  return (Array.isArray(options) ? options : []).find((option) => {
    const text = String(option?.text || '').trim().toUpperCase();
    return text === 'CPT' || text.startsWith('CPT ') || text.startsWith('CPT-');
  }) || null;
}

function parsePaymentTextId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
}

function tomorrow() {
  return nextWeekday();
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isFinite(num)) {
    return `${num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
  }
  return `${value} EUR`;
}

function inSevenDays() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function createPositionDefaults(overrides = {}) {
  return {
    deliveryDate: tomorrow(),
    deliveryDateAuto: true,
    wpzId: null,
    wpzOriginal: true,
    wpzComment: 'Original verwenden',
    ...overrides,
  };
}

let clientPositionSequence = 0;

function createClientPositionKey(seed = 'position') {
  clientPositionSequence += 1;
  return `${String(seed || 'position')}-${Date.now()}-${clientPositionSequence}`;
}

function getPositionWpzPayload(position) {
  if (!position?.wpzId) {
    return { wpzId: null, wpzOriginal: null, wpzComment: normalizeWpzFields(position).wpzComment || null };
  }
  return { wpzId: position.wpzId, ...normalizeWpzFields(position) };
}

function getPositionKey(position, index) {
  return String(position?.clientKey || position?.id || `${position?.beNumber || 'position'}-${index}`);
}

function formatDeliveryAddressParts(addr) {
  const text = String(addr?.text || '').trim();
  const primary = [String(addr?.name1 || '').trim(), String(addr?.name2 || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!text) {
    return { primary: primary || '-', secondary: '' };
  }
  const parts = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (!primary) {
    return {
      primary: parts[0] || text,
      secondary: parts.slice(1).join(', '),
    };
  }
  const lowerPrimary = primary.toLowerCase();
  const secondaryFromText = text.toLowerCase().startsWith(`${lowerPrimary},`)
    ? text.slice(primary.length + 1).trim()
    : parts.slice(1).join(', ');
  return { primary, secondary: secondaryFromText };
}

function renderDeliveryAddressOption(addr) {
  const { primary, secondary } = formatDeliveryAddressParts(addr);
  return (
    <Box sx={{ display: 'grid', minWidth: 0, width: '100%' }}>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {primary}
      </Typography>
      {secondary && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {secondary}
        </Typography>
      )}
    </Box>
  );
}

const PACKAGING_TYPES_DE = [
  'Sackware',
  'Siloware',
  'Big Bags',
  'Octa',
  'Andere',
  'NEUTRALE Sackware',
  'NEUTRALE Oktabins',
];

const PACKAGING_TYPES_EN = [
  'Bags',
  'Silo/bulk',
  'Big Bags',
  'Octabins',
  'Others',
  'NEUTRAL Bags',
  'NEUTRAL Octas',
];

const PACKAGING_TYPE_LABELS = {
  sackware: { de: 'Sackware', en: 'Bags' },
  'siloware': { de: 'Siloware', en: 'Silo/bulk' },
  'big bags': { de: 'Big Bags', en: 'Big Bags' },
  octa: { de: 'Octa', en: 'Octabins' },
  octabins: { de: 'Octa', en: 'Octabins' },
  andere: { de: 'Andere', en: 'Others' },
  others: { de: 'Andere', en: 'Others' },
  'neutrale sackware': { de: 'NEUTRALE Sackware', en: 'NEUTRAL Bags' },
  'neutral bags': { de: 'NEUTRALE Sackware', en: 'NEUTRAL Bags' },
  'neutrale oktabins': { de: 'NEUTRALE Oktabins', en: 'NEUTRAL Octas' },
  'neutral octas': { de: 'NEUTRALE Oktabins', en: 'NEUTRAL Octas' },
};

function resolvePackagingOption(value, options, lang) {
  const text = String(value || '').trim();
  if (!text) return '';
  const direct = (Array.isArray(options) ? options : [])
    .find((option) => String(option || '').trim().toLowerCase() === text.toLowerCase());
  if (direct) return direct;
  return PACKAGING_TYPE_LABELS[text.toLowerCase()]?.[lang] || text;
}

function normalizePackagingType(value) {
  const key = String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  const canonical = {
    sackware: 'sackware',
    bags: 'sackware',
    siloware: 'siloware',
    'silo/bulk': 'siloware',
    'big bags': 'big bags',
    octa: 'octa',
    octabins: 'octa',
    andere: 'andere',
    others: 'andere',
    'neutrale sackware': 'neutrale sackware',
    'neutral bags': 'neutrale sackware',
    'neutrale oktabins': 'neutrale oktabins',
    'neutral octas': 'neutrale oktabins',
  };
  return canonical[key] || key;
}

export default function TempOrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useI18n();
  const activeMandant = getMandant();

  const source = location.state?.source || null;
  const sourceItems = Array.isArray(location.state?.sourceItems) ? location.state.sourceItems : null;
  const copyOrder = location.state?.copyOrder || null;
  const copyPositions = Array.isArray(copyOrder?.positions) ? copyOrder.positions : null;
  const isCartCreate = !isEdit && Array.isArray(sourceItems) && sourceItems.length > 0;
  const isCopyCreate = !isEdit && Array.isArray(copyPositions) && copyPositions.length > 0;
  const isManualCreate = !isEdit && !isCartCreate && !isCopyCreate;
  const isPositionsMode = isEdit || isCartCreate || isCopyCreate || isManualCreate;

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [validationOpen, setValidationOpen] = React.useState(false);
  const [validationMessages, setValidationMessages] = React.useState([]);
  const [deleteLastConfirmOpen, setDeleteLastConfirmOpen] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState(false);
  const [attachmentFile, setAttachmentFile] = React.useState(null);
  const [attachmentMeta, setAttachmentMeta] = React.useState({ hasAttachment: false, fileName: '', mimeType: '' });
  const [removeAttachment, setRemoveAttachment] = React.useState(false);
  const attachmentInputRef = React.useRef(null);
  const deliveryAddressRequestRef = React.useRef(0);
  const deliveryDateCheckRequestRef = React.useRef(0);

  const [customerQuery, setCustomerQuery] = React.useState('');
  const [customerOptions, setCustomerOptions] = React.useState([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [representativeOptions, setRepresentativeOptions] = React.useState([]);
  const [customerPaymentDefaultId, setCustomerPaymentDefaultId] = React.useState('');
  const [customerPaymentDefaultText, setCustomerPaymentDefaultText] = React.useState('');
  const [customerReminderInvoicesCount, setCustomerReminderInvoicesCount] = React.useState(0);
  const [positions, setPositions] = React.useState([]);
  const [editingArticleKey, setEditingArticleKey] = React.useState('');
  const [editingArticleValue, setEditingArticleValue] = React.useState('');
  const [splitPositionIndex, setSplitPositionIndex] = React.useState(-1);
  const [splitKeptQuantity, setSplitKeptQuantity] = React.useState('');
  const [splitError, setSplitError] = React.useState('');
  const [mandants, setMandants] = React.useState([]);
  const [deliveryAddressOptions, setDeliveryAddressOptions] = React.useState([]);
  const [deliveryDateStatuses, setDeliveryDateStatuses] = React.useState({});
  const [paymentTextOptions, setPaymentTextOptions] = React.useState([]);
  const [incotermOptions, setIncotermOptions] = React.useState([]);
  const [addPosOpen, setAddPosOpen] = React.useState(false);
  const [addPosQuery, setAddPosQuery] = React.useState('');
  const [addPosOptions, setAddPosOptions] = React.useState([]);
  const [addPosProduct, setAddPosProduct] = React.useState(null);
  const [addPosQty, setAddPosQty] = React.useState('');
  const [addPosSalePrice, setAddPosSalePrice] = React.useState('');
  const [addPosDeliveryDate, setAddPosDeliveryDate] = React.useState(tomorrow());
  const [addPosDeliveryDateAuto, setAddPosDeliveryDateAuto] = React.useState(true);
  const [addPosError, setAddPosError] = React.useState('');
  const [addPosWpzId, setAddPosWpzId] = React.useState(null);
  const [addPosWpzOriginal, setAddPosWpzOriginal] = React.useState(true);
  const [addPosWpzComment, setAddPosWpzComment] = React.useState('Original verwenden');
  const [addPosOriginalPackagingType, setAddPosOriginalPackagingType] = React.useState('');
  const splitPosition = splitPositionIndex >= 0 ? positions[splitPositionIndex] || null : null;
  const splitPreview = calculatePositionSplit(splitPosition?.amountInKg, splitKeptQuantity);
  const addPosOptionsWithSelection = React.useMemo(() => {
    if (!addPosProduct) return addPosOptions;
    const exists = addPosOptions.some((x) => String(x?.id || '') === String(addPosProduct?.id || ''));
    return exists ? addPosOptions : [addPosProduct, ...addPosOptions];
  }, [addPosOptions, addPosProduct]);
  const addPosAvailableAmount = React.useMemo(() => {
    const backendAvailable = Number(addPosProduct?.availableAmount);
    if (Number.isFinite(backendAvailable)) return Math.max(backendAvailable, 0);
    const total = Number(addPosProduct?.amount);
    const reserved = Number(addPosProduct?.reserved);
    if (!Number.isFinite(total)) return null;
    if (!Number.isFinite(reserved)) return total;
    return Math.max(total - reserved, 0);
  }, [addPosProduct]);

  const deliveryDateSignature = React.useMemo(() => (
    [
      ...(Array.isArray(positions) ? positions.map((position) => String(position?.deliveryDate || '').trim()) : []),
      addPosOpen ? String(addPosDeliveryDate || '').trim() : '',
    ].filter(Boolean).filter((date, index, values) => values.indexOf(date) === index).join('|')
  ), [addPosDeliveryDate, addPosOpen, positions]);

  const [form, setForm] = React.useState({
    clientReferenceId: '',
    clientName: '',
    clientAddress: '',
    clientRepresentative: '',
    comment: '',
    supplier: '',
    specialPaymentCondition: false,
    specialPaymentText: '',
    specialPaymentId: '',
    incotermText: '',
    incotermId: '',
    packagingType: '',
    deliveryAddress: '',
    deliveryAddressId: '',
    deliveryAddressManual: false,
  });
  const packagingOptions = React.useMemo(() => (lang === 'en' ? PACKAGING_TYPES_EN : PACKAGING_TYPES_DE), [lang]);
  const packagingTouchedRef = React.useRef(false);
  const packagingCacheRef = React.useRef(new Map());
  const packagingRequestsRef = React.useRef(new Map());
  const addPosPackagingBeNumberRef = React.useRef('');

  React.useEffect(() => {
    let alive = true;
    apiRequest('/mandants')
      .then((response) => {
        if (alive) setMandants(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (alive) setMandants([]);
      });
    return () => { alive = false; };
  }, []);

  const loadOriginalPackagingType = React.useCallback(async (beNumber) => {
    const key = String(beNumber || '').trim();
    if (!key) return '';

    if (packagingCacheRef.current.has(key)) {
      return packagingCacheRef.current.get(key) || '';
    }

    const existingRequest = packagingRequestsRef.current.get(key);
    if (existingRequest) return existingRequest;

    const request = apiRequest(`/temp-orders/meta/by-be-number/${encodeURIComponent(key)}`)
      .then((res) => {
        const raw = String(res?.data?.packagingType || '').trim();
        const resolved = resolvePackagingOption(raw, packagingOptions, lang);
        packagingCacheRef.current.set(key, resolved);
        return resolved;
      })
      .catch(() => {
        packagingCacheRef.current.set(key, '');
        return '';
      })
      .finally(() => {
        packagingRequestsRef.current.delete(key);
      });
    packagingRequestsRef.current.set(key, request);
    return request;
  }, [lang, packagingOptions]);

  const resolvePaymentTextById = React.useCallback((id) => {
    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) return null;
    const hit = paymentTextOptions.find((x) => Number(x.id) === idNum);
    return hit ? { id: idNum, text: String(hit.text || '') } : null;
  }, [paymentTextOptions]);
  const loadCustomerPaymentDefault = React.useCallback(async (clientReferenceId, customer = null, fallback = null) => {
    const id = String(clientReferenceId || '').trim();
    if (!id) {
      setCustomerPaymentDefaultId('');
      setCustomerPaymentDefaultText('');
      return { id: '', text: '' };
    }

    const fallbackId = parsePaymentTextId(fallback?.id);
    const fallbackText = String(fallback?.text || '').trim();
    let paymentTextId = parsePaymentTextId(customer?.kd_Zahltext);
    if (!paymentTextId) {
      try {
        const detail = await apiRequest(`/customers/${encodeURIComponent(id)}`);
        paymentTextId = parsePaymentTextId(detail?.data?.kd_Zahltext);
      } catch {
        // The customer selection remains usable even when the optional detail
        // refresh is temporarily unavailable. The payment list is retried below.
      }
    }
    if (!paymentTextId) paymentTextId = fallbackId;

    const resolved = paymentTextId ? resolvePaymentTextById(paymentTextId) : null;
    const next = {
      id: paymentTextId,
      text: resolved?.text || (paymentTextId === fallbackId ? fallbackText : ''),
    };
    setCustomerPaymentDefaultId(next.id);
    setCustomerPaymentDefaultText(next.text);
    return next;
  }, [resolvePaymentTextById]);
  const loadDeliveryAddresses = React.useCallback(async (clientReferenceId) => {
    const requestId = deliveryAddressRequestRef.current + 1;
    deliveryAddressRequestRef.current = requestId;
    const id = String(clientReferenceId || '').trim();
    if (!id) {
      setDeliveryAddressOptions([]);
      return [];
    }
    try {
      const res = await apiRequest(`/customers/${encodeURIComponent(id)}/delivery-addresses`);
      const list = Array.isArray(res?.data) ? res.data : [];
      if (deliveryAddressRequestRef.current === requestId) setDeliveryAddressOptions(list);
      return list;
    } catch {
      if (deliveryAddressRequestRef.current === requestId) setDeliveryAddressOptions([]);
      return [];
    }
  }, []);

  React.useEffect(() => {
    if (form.deliveryAddressManual || !String(form.deliveryAddress || '').trim()) {
      return;
    }
    const matchingAddress = deliveryAddressOptions.find((address) => (
      String(address?.text || '').trim() === String(form.deliveryAddress || '').trim()
    ));
    if (!matchingAddress || String(form.deliveryAddressId || '') === String(matchingAddress.id || '')) return;
    setForm((prev) => {
      if (prev.deliveryAddressManual || String(prev.deliveryAddressId || '') === String(matchingAddress.id || '')) return prev;
      return { ...prev, deliveryAddressId: matchingAddress.id };
    });
  }, [deliveryAddressOptions, form.deliveryAddress, form.deliveryAddressId, form.deliveryAddressManual]);

  React.useEffect(() => {
    if (form.deliveryAddressManual || String(form.deliveryAddress || '').trim() || deliveryAddressOptions.length !== 1) {
      return;
    }
    const onlyAddress = deliveryAddressOptions[0];
    if (!String(onlyAddress?.text || '').trim()) return;
    setForm((prev) => {
      if (prev.deliveryAddressManual || String(prev.deliveryAddress || '').trim()) return prev;
      return {
        ...prev,
        deliveryAddress: onlyAddress.text,
        deliveryAddressId: onlyAddress.id || '',
      };
    });
  }, [deliveryAddressOptions, form.deliveryAddress, form.deliveryAddressManual]);

  React.useEffect(() => {
    const dates = deliveryDateSignature ? deliveryDateSignature.split('|') : [];
    const requestId = deliveryDateCheckRequestRef.current + 1;
    deliveryDateCheckRequestRef.current = requestId;
    const fallback = Object.fromEntries(dates.map((date) => [date, getWeekendStatus(date, { showHint: false })]));
    if (!dates.length) {
      setDeliveryDateStatuses({});
      return undefined;
    }

    const customerId = String(form.clientReferenceId || '').trim();
    const deliveryAddressId = String(form.deliveryAddressId || '').trim();
    if (!customerId || form.deliveryAddressManual || !deliveryAddressId) {
      setDeliveryDateStatuses(fallback);
      return undefined;
    }

    let alive = true;
    apiRequest('/delivery-calendar/check', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        deliveryAddressId,
        dates,
      }),
    }).then((response) => {
      if (!alive || deliveryDateCheckRequestRef.current !== requestId) return;
      const statuses = Array.isArray(response?.data) ? response.data : [];
      const statusByDate = new Map(statuses.map((status) => [String(status?.date || '').slice(0, 10), status]));
      const merged = Object.fromEntries(dates.map((date) => [date, statusByDate.get(date) || getWeekendStatus(date, { showHint: false })]));
      setDeliveryDateStatuses(merged);

      setPositions((previous) => {
        let changed = false;
        const next = previous.map((position) => {
          const currentDate = String(position?.deliveryDate || '').slice(0, 10);
          const status = statusByDate.get(currentDate);
          if (!position?.deliveryDateAuto || !status?.suggestedDate || (!status.isWeekend && !status.isHoliday)) {
            return position;
          }
          changed = true;
          return { ...position, deliveryDate: status.suggestedDate };
        });
        return changed ? next : previous;
      });

      if (addPosOpen && addPosDeliveryDateAuto) {
        const addStatus = statusByDate.get(String(addPosDeliveryDate || '').slice(0, 10));
        if (addStatus?.suggestedDate && (addStatus.isWeekend || addStatus.isHoliday)) {
          setAddPosDeliveryDate(addStatus.suggestedDate);
        }
      }
    }).catch(() => {
      if (!alive || deliveryDateCheckRequestRef.current !== requestId) return;
      // A calendar lookup must never block the order flow. If the scope or
      // central calendar cannot be confirmed, keep the warning suppressed.
      setDeliveryDateStatuses(fallback);
    });

    return () => { alive = false; };
  }, [addPosDeliveryDate, addPosDeliveryDateAuto, addPosOpen, deliveryDateSignature, form.clientReferenceId, form.deliveryAddressId, form.deliveryAddressManual]);

  const loadCustomerRepresentatives = React.useCallback(async (clientReferenceId, preferredName = '') => {
    const customerId = String(clientReferenceId || '').trim();
    const preferred = String(preferredName || '').trim();
    if (!customerId) {
      setRepresentativeOptions([]);
      setCustomerReminderInvoicesCount(0);
      setForm((prev) => ({ ...prev, clientRepresentative: '' }));
      return [];
    }

    try {
      const detail = await apiRequest(`/customers/${encodeURIComponent(customerId)}`);
      const options = normalizeRepresentativeOptions(detail?.data?.representatives, preferred);
      setRepresentativeOptions(options);
      setCustomerReminderInvoicesCount(Number(detail?.data?.reminderInvoicesCount) || 0);
      setForm((prev) => ({
        ...prev,
        clientRepresentative: preferred || getDefaultContactName(options),
      }));
      return options;
    } catch {
      const fallbackOptions = normalizeRepresentativeOptions([], preferred);
      setRepresentativeOptions(fallbackOptions);
      setCustomerReminderInvoicesCount(0);
      setForm((prev) => ({ ...prev, clientRepresentative: preferred }));
      return fallbackOptions;
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      if (isEdit) {
        try {
          setLoading(true);
          const res = await apiRequest(`/temp-orders/${encodeURIComponent(id)}`);
          if (!alive) return;
          const d = res?.data || {};
          const loadedStatus = normalizeTempOrderStatus(d.orderStatus, d.completed);
          if (!isTempOrderEditableStatus(loadedStatus, d.completed)) {
            navigate(`/temp-orders/${encodeURIComponent(id)}`, { replace: true });
            return;
          }
          setAttachmentFile(null);
          setRemoveAttachment(false);
          setAttachmentMeta({
            hasAttachment: Boolean(d.hasAttachment),
            fileName: d.attachmentFileName || '',
            mimeType: d.attachmentMimeType || '',
          });
          setForm({
            clientReferenceId: d.clientReferenceId || '',
            clientName: d.clientName || '',
            clientAddress: d.clientAddress || '',
            clientRepresentative: d.clientRepresentative || '',
            comment: d.comment || '',
            supplier: d.distributor || '',
            specialPaymentCondition: Boolean(d.specialPaymentCondition),
            specialPaymentText: d.specialPaymentText || '',
            specialPaymentId: d.specialPaymentId ?? '',
            incotermText: d.deliveryType || '',
            incotermId: d.deliveryTypeId ?? '',
            packagingType: d.packagingType || '',
            deliveryAddress: d.deliveryAddress || '',
            deliveryAddressId: d.deliveryAddressId === null || d.deliveryAddressId === undefined ? '' : String(d.deliveryAddressId),
            deliveryAddressManual: Boolean(d.deliveryAddressChanged),
          });
          await loadCustomerPaymentDefault(
            d.clientReferenceId || '',
            null,
            d.specialPaymentCondition
              ? null
              : { id: d.specialPaymentId, text: d.specialPaymentText },
          );
          await loadDeliveryAddresses(d.clientReferenceId || '');
          await loadCustomerRepresentatives(d.clientReferenceId || '', d.clientRepresentative || '');
          const loadedPositions = Array.isArray(d.positions) ? d.positions : [];
          setPositions(loadedPositions.map((p) => ({
            id: p.id,
            clientKey: `stored-${p.id}`,
            beNumber: p.beNumber,
            warehouseId: p.warehouse || p.warehouseId,
            article: p.article,
            articleOriginal: p.articleOriginal || '',
            articleChanged: Boolean(p.articleChanged),
            amountInKg: p.amountInKg,
            price: p.price,
            costPrice: p.costPrice ?? null,
            originalPackagingType: p.originalPackagingType || '',
            packagingTypeChanged: Boolean(p.packagingTypeChanged),
            reservationInKg: p.reservationInKg,
            reservationDate: p.reservationDate,
            ...createPositionDefaults({
              deliveryDate: p.deliveryDate ? String(p.deliveryDate).slice(0, 10) : (d.deliveryDate ? String(d.deliveryDate).slice(0, 10) : tomorrow()),
              deliveryDateAuto: !(p.deliveryDate || d.deliveryDate),
              wpzId: p.wpzId ?? null,
              wpzOriginal: p.wpzOriginal ?? true,
              wpzComment: p.wpzComment || 'Original verwenden',
            }),
          })));
        } catch (e) {
          if (alive) setError(e?.message || t('loading_error'));
        } finally {
          if (alive) setLoading(false);
        }
        return;
      }

      if (isCopyCreate && Array.isArray(copyPositions) && copyPositions.length > 0) {
        setForm((prev) => ({
          ...prev,
          clientReferenceId: copyOrder?.clientReferenceId || '',
          clientName: copyOrder?.clientName || '',
          clientAddress: copyOrder?.clientAddress || '',
          clientRepresentative: copyOrder?.clientRepresentative || '',
          comment: copyOrder?.comment || '',
          specialPaymentCondition: Boolean(copyOrder?.specialPaymentCondition),
          specialPaymentText: copyOrder?.specialPaymentText || '',
          specialPaymentId: copyOrder?.specialPaymentId ?? '',
          incotermText: copyOrder?.deliveryType || '',
          incotermId: copyOrder?.deliveryTypeId ?? '',
          packagingType: copyOrder?.packagingType || '',
          deliveryAddress: copyOrder?.deliveryAddress || '',
          deliveryAddressId: copyOrder?.deliveryAddressId === null || copyOrder?.deliveryAddressId === undefined
            ? ''
            : String(copyOrder.deliveryAddressId),
          deliveryAddressManual: Boolean(copyOrder?.deliveryAddressChanged),
        }));
        await loadCustomerPaymentDefault(
          copyOrder?.clientReferenceId || '',
          null,
          copyOrder?.specialPaymentCondition
            ? null
            : { id: copyOrder?.specialPaymentId, text: copyOrder?.specialPaymentText },
        );
        await loadDeliveryAddresses(copyOrder?.clientReferenceId || '');
        await loadCustomerRepresentatives(copyOrder?.clientReferenceId || '');
        setPositions(copyPositions.map((x, idx) => ({
          id: null,
          clientKey: createClientPositionKey(x.beNumber || `copy-${idx}`),
          productId: x.productId || null,
          beNumber: x.beNumber,
          warehouseId: x.warehouseId || x.warehouse,
          article: x.article,
          articleOriginal: x.articleOriginal || '',
          articleChanged: Boolean(x.articleChanged),
          amountInKg: x.amountInKg,
          price: x.salePrice ?? x.price,
          costPrice: x.costPrice ?? x.ep ?? null,
          originalPackagingType: '',
          packagingTypeChanged: false,
          reservationInKg: x.reservationInKg ?? null,
          reservationDate: x.reservationDate ?? null,
          ...createPositionDefaults({
            deliveryDate: x.deliveryDate ? String(x.deliveryDate).slice(0, 10) : (copyOrder?.deliveryDate ? String(copyOrder.deliveryDate).slice(0, 10) : tomorrow()),
            deliveryDateAuto: x.deliveryDateAuto !== undefined
              ? Boolean(x.deliveryDateAuto)
              : !(x.deliveryDate || copyOrder?.deliveryDate),
            wpzId: x.wpzId ?? null,
            wpzOriginal: x.wpzOriginal ?? true,
            wpzComment: x.wpzComment || 'Original verwenden',
          }),
        })));
        setAttachmentFile(null);
        setRemoveAttachment(false);
        setAttachmentMeta({ hasAttachment: false, fileName: '', mimeType: '' });
        return;
      }

      if (!source?.beNumber || !source?.warehouseId) {
        if (Array.isArray(sourceItems) && sourceItems.length > 0) {
          setPositions(sourceItems.map((x, idx) => ({
            id: null,
            clientKey: x.clientKey || createClientPositionKey(x.beNumber || `cart-${idx}`),
            productId: x.productId || x.id || null,
            beNumber: x.beNumber,
            warehouseId: x.warehouseId,
            article: x.article,
            articleOriginal: x.articleOriginal || '',
            articleChanged: Boolean(x.articleChanged),
            amountInKg: x.amountInKg,
            price: x.salePrice ?? x.price,
            costPrice: x.costPrice ?? null,
            originalPackagingType: x.originalPackagingType || '',
            packagingTypeChanged: false,
            reservationInKg: null,
            reservationDate: null,
            ...createPositionDefaults({
              deliveryDate: x.deliveryDate ? String(x.deliveryDate).slice(0, 10) : tomorrow(),
              deliveryDateAuto: x.deliveryDateAuto !== undefined ? Boolean(x.deliveryDateAuto) : !x.deliveryDate,
              wpzId: x.wpzId ?? null,
              wpzOriginal: x.wpzOriginal ?? true,
              wpzComment: x.wpzComment || 'Original verwenden',
            }),
          })));
        }
        setAttachmentFile(null);
        setRemoveAttachment(false);
        setAttachmentMeta({ hasAttachment: false, fileName: '', mimeType: '' });
        return;
      }

      setAttachmentFile(null);
      setRemoveAttachment(false);
      setAttachmentMeta({ hasAttachment: false, fileName: '', mimeType: '' });
      setForm((prev) => ({
        ...prev,
        comment: source.comment || '',
      }));
    };
    run();
    return () => { alive = false; };
  }, [id, isEdit, source, sourceItems, t, navigate, loadCustomerPaymentDefault, loadDeliveryAddresses, loadCustomerRepresentatives, isCopyCreate, copyPositions, copyOrder]);

  React.useEffect(() => {
    const missingPositions = (Array.isArray(positions) ? positions : [])
      .filter((position) => String(position?.beNumber || '').trim() && !String(position?.originalPackagingType || '').trim());
    if (!missingPositions.length) return undefined;

    let cancelled = false;
    void Promise.all(missingPositions.map(async (position) => ({
      id: position.id,
      beNumber: position.beNumber,
      originalPackagingType: await loadOriginalPackagingType(position.beNumber),
    }))).then((loaded) => {
      if (cancelled) return;
      const byKey = new Map(loaded.map((entry) => [`${String(entry.id || '')}\u001f${String(entry.beNumber || '')}`, entry.originalPackagingType]));
      setPositions((previous) => {
        let changed = false;
        const next = previous.map((position) => {
          if (String(position.originalPackagingType || '').trim()) return position;
          const key = `${String(position.id || '')}\u001f${String(position.beNumber || '')}`;
          const originalPackagingType = byKey.get(key);
          if (!originalPackagingType) return position;
          changed = true;
          return { ...position, originalPackagingType };
        });
        return changed ? next : previous;
      });
    });
    return () => { cancelled = true; };
  }, [loadOriginalPackagingType, positions]);

  const packagingSelectionState = React.useMemo(() => {
    const list = Array.isArray(positions) ? positions : [];
    const originals = list.map((position) => String(position?.originalPackagingType || '').trim());
    const complete = list.length > 0 && originals.every(Boolean);
    const canonicalTypes = new Set(originals.filter(Boolean).map(normalizePackagingType));
    return {
      complete,
      mixed: complete && canonicalTypes.size > 1,
      singleType: complete && canonicalTypes.size === 1 ? originals[0] : '',
    };
  }, [positions]);

  React.useEffect(() => {
    if (isEdit || isCopyCreate || packagingTouchedRef.current || !packagingSelectionState.complete) return;
    const defaultPackagingType = packagingSelectionState.mixed
      ? ''
      : resolvePackagingOption(packagingSelectionState.singleType, packagingOptions, lang);
    setForm((previous) => (
      String(previous.packagingType || '') === defaultPackagingType
        ? previous
        : { ...previous, packagingType: defaultPackagingType }
    ));
  }, [isCopyCreate, isEdit, lang, packagingOptions, packagingSelectionState]);

  React.useEffect(() => {
    const targetId = Number(form.specialPaymentId || customerPaymentDefaultId);
    if (!Number.isFinite(targetId) || targetId <= 0) return;
    if (!paymentTextOptions.length) return;
    const resolved = resolvePaymentTextById(targetId);
    if (!resolved) return;
    const paymentTextChanged = String(form.specialPaymentText || '') !== resolved.text;
    const paymentIdChanged = Number(form.specialPaymentId) !== resolved.id;
    const defaultTextChanged = Number(customerPaymentDefaultId) === resolved.id && String(customerPaymentDefaultText || '') !== resolved.text;
    if (!paymentTextChanged && !paymentIdChanged && !defaultTextChanged) return;
    if (defaultTextChanged) setCustomerPaymentDefaultText(resolved.text);
    if (paymentIdChanged || paymentTextChanged) {
      setForm((prev) => ({
        ...prev,
        specialPaymentId: resolved.id,
        specialPaymentText: resolved.text,
      }));
    }
  }, [
    form.specialPaymentId,
    form.specialPaymentText,
    customerPaymentDefaultId,
    customerPaymentDefaultText,
    paymentTextOptions,
    resolvePaymentTextById,
  ]);

  const paymentTextOptionsWithSelection = React.useMemo(() => {
    const options = Array.isArray(paymentTextOptions) ? paymentTextOptions : [];
    const selectedId = parsePaymentTextId(form.specialPaymentId);
    const selectedText = String(form.specialPaymentText || '').trim();
    if (!selectedId || !selectedText || options.some((option) => Number(option?.id) === selectedId)) {
      return options;
    }
    return [{ id: selectedId, text: selectedText }, ...options];
  }, [form.specialPaymentId, form.specialPaymentText, paymentTextOptions]);

  React.useEffect(() => {
    let alive = true;
    let retryTimer = null;
    const retryDelays = [0, 400, 1200, 2500];

    const run = async (attempt = 0) => {
      try {
        const res = await apiRequest('/temp-orders/payment-texts');
        if (!alive) return;
        const data = Array.isArray(res?.data) ? res.data : [];
        if (data.length > 0 || attempt >= retryDelays.length - 1) {
          setPaymentTextOptions(data);
          return;
        }
      } catch {
        if (!alive) return;
      }

      if (!alive) return;
      const nextAttempt = attempt + 1;
      if (nextAttempt >= retryDelays.length) {
        setPaymentTextOptions([]);
        return;
      }
      retryTimer = window.setTimeout(() => { void run(nextAttempt); }, retryDelays[nextAttempt]);
    };

    void run();
    return () => {
      alive = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [activeMandant]);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const res = await apiRequest('/temp-orders/incoterms');
        if (!alive) return;
        setIncotermOptions(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!alive) return;
        setIncotermOptions([]);
      }
    };
    run();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    const defaultIncoterm = findDefaultIncoterm(incotermOptions);
    if (!defaultIncoterm || form.incotermId) return;
    setForm((previous) => {
      if (previous.incotermId) return previous;
      return {
        ...previous,
        incotermId: Number(defaultIncoterm.id),
        incotermText: defaultIncoterm.text,
      };
    });
  }, [incotermOptions, form.incotermId]);

  React.useEffect(() => {
    if (!addPosOpen) return undefined;
    const h = setTimeout(async () => {
      const q = addPosQuery.trim();
      if (!q) {
        setAddPosOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/products?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=article&dir=ASC`);
        setAddPosOptions(res?.data || []);
      } catch {
        setAddPosOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [addPosOpen, addPosQuery]);

  React.useEffect(() => {
    const h = setTimeout(async () => {
      const q = customerQuery.trim();
      if (!q) {
        setCustomerOptions([]);
        return;
      }
      try {
        const res = await apiRequest(`/customers?page=1&pageSize=20&q=${encodeURIComponent(q)}&sort=kd_Name1&dir=ASC`);
        setCustomerOptions(res?.data || []);
      } catch {
        setCustomerOptions([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [customerQuery]);

  const onChooseCustomer = React.useCallback(async (customer, opts = {}) => {
    setSelectedCustomer(customer);
    if (!customer) {
      clearStoredSelectedCustomer();
      setDeliveryAddressOptions([]);
      setRepresentativeOptions([]);
      setCustomerPaymentDefaultId('');
      setCustomerPaymentDefaultText('');
      setCustomerReminderInvoicesCount(0);
      setForm((prev) => ({ ...prev, clientRepresentative: '' }));
      return;
    }

    const clientReferenceId = String(customer.kd_KdNR || '').trim();
    const clientName = String(customer.kd_Name1 || customer.kd_Name2 || '').trim();
    const clientAddress = buildAddress(customer);

    if (!opts.skipStore) {
      storeSelectedCustomer({
        id: clientReferenceId,
        name: clientName,
        address: clientAddress,
        representative: customer.kd_Aussendienst || '',
      });
    }

    setDeliveryAddressOptions([]);
    setForm((prev) => ({
      ...prev,
      clientReferenceId,
      clientName,
      clientAddress,
      clientRepresentative: '',
      deliveryAddress: '',
      deliveryAddressId: '',
      deliveryAddressManual: false,
    }));

    const customerPayment = await loadCustomerPaymentDefault(clientReferenceId, customer);
    setForm((prev) => {
      if (!prev.specialPaymentCondition) {
        return {
          ...prev,
          specialPaymentId: customerPayment.id || '',
          specialPaymentText: customerPayment.text || '',
        };
      }
      if (!customerPayment.id) {
        return {
          ...prev,
          specialPaymentId: '',
          specialPaymentText: '',
        };
      }
      if (!prev.specialPaymentId && customerPayment.id) {
        return {
          ...prev,
          specialPaymentId: customerPayment.id,
          specialPaymentText: customerPayment.text || '',
        };
      }
      return prev;
    });

    await loadDeliveryAddresses(clientReferenceId);

    await loadCustomerRepresentatives(clientReferenceId);
  }, [loadCustomerPaymentDefault, loadDeliveryAddresses, loadCustomerRepresentatives]);

  React.useEffect(() => {
    if (isEdit || isCopyCreate || form.clientReferenceId) return;
    let alive = true;
    (async () => {
      const storedCustomer = getStoredSelectedCustomer();
      if (!storedCustomer?.id) return;
      try {
        const detail = await apiRequest(`/customers/${encodeURIComponent(storedCustomer.id)}`);
        if (!alive) return;
        await onChooseCustomer(detail?.data || {
          kd_KdNR: storedCustomer.id,
          kd_Name1: storedCustomer.name,
          kd_Strasse: storedCustomer.address,
          kd_Aussendienst: storedCustomer.representative,
        }, { skipStore: true });
        setCustomerQuery(storedCustomer.name || storedCustomer.id);
      } catch {
        if (!alive) return;
        await onChooseCustomer({
          kd_KdNR: storedCustomer.id,
          kd_Name1: storedCustomer.name,
          kd_Strasse: storedCustomer.address,
          kd_Aussendienst: storedCustomer.representative,
        }, { skipStore: true });
        setCustomerQuery(storedCustomer.name || storedCustomer.id);
      }
    })();
    return () => { alive = false; };
  }, [form.clientReferenceId, isCopyCreate, isEdit, onChooseCustomer]);

  const deleteOrder = React.useCallback(async () => {
    if (!isEdit || !id) return;
    try {
      setDeletingOrder(true);
      setError('');
      setSuccess('');
      await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSuccess(t('temp_order_deleted'));
      navigate('/temp-orders');
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setDeletingOrder(false);
      setDeleteLastConfirmOpen(false);
    }
  }, [id, isEdit, navigate, t]);

  const onRemovePosition = React.useCallback((idx) => {
    if (!Array.isArray(positions) || idx < 0 || idx >= positions.length) return;
    const isLastPosition = positions.length === 1;
    if (isLastPosition && isEdit) {
      setDeleteLastConfirmOpen(true);
      return;
    }
    setPositions((prev) => prev.filter((_, i) => i !== idx));
  }, [isEdit, positions]);

  const openSplitDialog = React.useCallback((position, idx, event) => {
    event?.stopPropagation();
    if (!calculatePositionSplit(position?.amountInKg, 1).ok) return;
    setSplitPositionIndex(idx);
    setSplitKeptQuantity('');
    setSplitError('');
  }, []);

  const closeSplitDialog = React.useCallback(() => {
    setSplitPositionIndex(-1);
    setSplitKeptQuantity('');
    setSplitError('');
  }, []);

  const confirmSplit = React.useCallback(() => {
    const split = splitPositionValues(splitPosition, splitKeptQuantity, 'amountInKg');
    if (!split) {
      setSplitError(t('position_split_minimum'));
      return;
    }
    const remainderPosition = {
      ...split.remainderPosition,
      id: null,
      clientKey: createClientPositionKey(splitPosition?.beNumber),
      splitFromPositionId: splitPosition?.id || splitPosition?.splitFromPositionId || null,
    };
    setPositions((previous) => {
      if (splitPositionIndex < 0 || splitPositionIndex >= previous.length) return previous;
      const next = [...previous];
      next.splice(splitPositionIndex, 1, split.keptPosition, remainderPosition);
      return next;
    });
    closeSplitDialog();
  }, [closeSplitDialog, splitKeptQuantity, splitPosition, splitPositionIndex, t]);

  const beginArticleEdit = React.useCallback((position, idx, event) => {
    event?.stopPropagation();
    setEditingArticleKey(getPositionKey(position, idx));
    setEditingArticleValue(String(position?.article || '').trim());
  }, []);

  const cancelArticleEdit = React.useCallback((event) => {
    event?.stopPropagation();
    setEditingArticleKey('');
    setEditingArticleValue('');
  }, []);

  const saveArticleEdit = React.useCallback((position, idx, event) => {
    event?.stopPropagation();
    const nextArticle = String(editingArticleValue || '').trim();
    if (!nextArticle) {
      setValidationMessages([t('validation_article_name_required')]);
      setValidationOpen(true);
      return;
    }
    const key = getPositionKey(position, idx);
    setPositions((previous) => previous.map((item, itemIndex) => (
      getPositionKey(item, itemIndex) === key
        ? { ...item, article: nextArticle }
        : item
    )));
    setEditingArticleKey('');
    setEditingArticleValue('');
  }, [editingArticleValue, t]);

  const visibleAttachmentName = attachmentFile
    ? attachmentFile.name
    : (!removeAttachment && attachmentMeta.hasAttachment ? attachmentMeta.fileName : '');

  const handleAttachmentPick = React.useCallback((event) => {
    const file = event?.target?.files?.[0] || null;
    setAttachmentFile(file);
    if (file) {
      setRemoveAttachment(false);
    }
    if (event?.target) {
      event.target.value = '';
    }
  }, []);

  const submit = async () => {
    const effectivePackagingType = String(form.packagingType || '').trim();
    const messages = [];
    if (!form.clientReferenceId) messages.push(t('validation_customer_required'));
    if (isPositionsMode && (!Array.isArray(positions) || positions.length === 0)) {
      messages.push('Mindestens eine Position muss vorhanden sein.');
    }
    if (!String(form.clientName || '').trim()) messages.push(t('validation_customer_name_required'));
    if (!String(form.clientAddress || '').trim()) messages.push(t('validation_customer_address_required'));
    if (representativeOptions.length > 1 && !String(form.clientRepresentative || '').trim()) {
      messages.push(t('validation_contact_required'));
    }
    if (!form.incotermId) messages.push(t('validation_incoterm_required'));
    if (!packagingSelectionState.complete) messages.push(t('validation_original_packaging_required'));
    if (!effectivePackagingType) messages.push(t('validation_packaging_required'));
    if (!String(form.deliveryAddress || '').trim()) messages.push(t('validation_delivery_address_required'));
    if (!form.specialPaymentId) messages.push(t('validation_special_payment_text_required'));

    for (const pos of (Array.isArray(positions) ? positions : [])) {
      const foreignMandant = findForeignMandantName(pos.beNumber, mandants, activeMandant);
      if (foreignMandant) {
        messages.push(`${pos.article || pos.beNumber}: ${t('article_from_mandant_readonly', { name: foreignMandant })}`);
      }
      if (!String(pos.article || '').trim()) {
        messages.push(`${pos.beNumber}: ${t('validation_article_name_required')}`);
      }
      const amount = Number(pos.amountInKg);
      const salePrice = Number(pos.price);
      const costPrice = Number(pos.costPrice);
      if (!String(pos.deliveryDate || '').trim()) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_delivery_date_required')}`);
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_amount_positive')}`);
      }
      if (!Number.isFinite(salePrice) || salePrice <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_sale_price_positive')}`);
      }
      if (!Number.isFinite(costPrice) || costPrice <= 0) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_price_positive')}`);
      }
      const wpz = getPositionWpzPayload(pos);
      if (wpz.wpzId && !String(wpz.wpzComment || '').trim()) {
        messages.push(`${pos.article || pos.beNumber}: ${t('validation_wpz_individual_required')}`);
      }
    }

    if (messages.length) {
      setValidationMessages(messages);
      setValidationOpen(true);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        clientReferenceId: form.clientReferenceId,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        clientRepresentative: form.clientRepresentative || null,
        comment: form.comment || null,
        supplier: form.supplier || null,
        specialPaymentCondition: Boolean(form.specialPaymentCondition),
        specialPaymentText: form.specialPaymentText || null,
        specialPaymentId: form.specialPaymentId === '' ? null : Number(form.specialPaymentId),
        incotermText: form.incotermText || null,
        incotermId: form.incotermId === '' ? null : Number(form.incotermId),
        packagingType: effectivePackagingType,
        deliveryAddress: form.deliveryAddress || null,
        deliveryAddressId: form.deliveryAddressId === '' || form.deliveryAddressId === null || form.deliveryAddressId === undefined
          ? null
          : Number(form.deliveryAddressId),
        deliveryAddressChanged: Boolean(form.deliveryAddressManual),
      };
      if (isPositionsMode && Array.isArray(positions) && positions.length > 0) {
        payload.positions = positions.map((x) => ({
          id: x.id,
          splitFromPositionId: x.splitFromPositionId || null,
          beNumber: x.beNumber,
          warehouseId: x.warehouseId,
          article: String(x.article || '').trim(),
          amountInKg: Number(x.amountInKg),
          salePricePerKg: Number(x.price),
          costPricePerKg: Number(x.costPrice),
          deliveryDate: x.deliveryDate || null,
          reservationInKg: x.reservationInKg === null || x.reservationInKg === undefined ? null : Number(x.reservationInKg),
          reservationDate: x.reservationDate || null,
          ...getPositionWpzPayload(x),
        }));
      }

      const requestBody = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === 'positions') {
          requestBody.append(key, JSON.stringify(value));
          return;
        }
        if (value === null || value === undefined) {
          requestBody.append(key, '');
          return;
        }
        requestBody.append(key, typeof value === 'boolean' ? String(value) : String(value));
      });
      requestBody.append('removeAttachment', removeAttachment ? 'true' : 'false');
      if (attachmentFile) {
        requestBody.append('attachment', attachmentFile);
      }

      const res = isEdit
        ? await apiRequest(`/temp-orders/${encodeURIComponent(id)}`, { method: 'PUT', body: requestBody })
        : await apiRequest('/temp-orders', { method: 'POST', body: requestBody });

      setSuccess(t('temp_order_saved'));
      const newId = res?.data?.id;
      if (newId) {
        if (!isCopyCreate && Array.isArray(sourceItems) && sourceItems.length > 0) clearOrderCart();
        navigate(`/temp-orders/${encodeURIComponent(newId)}`);
      } else {
        navigate('/temp-orders');
      }
    } catch (e) {
      setError(e?.message || t('loading_error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, width: '100%', minWidth: 0, mx: 'auto', overflowX: 'hidden' }}>
      <input
        ref={attachmentInputRef}
        type="file"
        accept=".pdf,image/*,.heic,.heif"
        hidden
        onChange={handleAttachmentPick}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        <IconButton aria-label="back" onClick={() => navigate(-1)}><ArrowBackIcon /></IconButton>
        <Typography variant="h5" sx={{ flex: 1, minWidth: 0 }}>
          {isEdit ? t('temp_order_edit_title') : t('temp_order_create_title')}
        </Typography>
        <IconButton
          aria-label={t('temp_order_attachment_add')}
          title={t('temp_order_attachment_add')}
          onClick={() => attachmentInputRef.current?.click()}
        >
          <AttachFileIcon />
        </IconButton>
      </Box>

      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {!loading && (
        <Card sx={{ width: '100%', minWidth: 0 }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: -0.5 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {t('temp_order_attachment_label')}
              </Typography>
              {visibleAttachmentName ? (
                <>
                  <Typography
                    variant="body2"
                    sx={{
                      minWidth: 0,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {visibleAttachmentName}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      if (attachmentFile) {
                        setAttachmentFile(null);
                        return;
                      }
                      if (attachmentMeta.hasAttachment && !removeAttachment) {
                        setRemoveAttachment(true);
                      }
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('temp_order_attachment_none')}
                </Typography>
              )}
            </Box>
            {removeAttachment && attachmentMeta.hasAttachment && !attachmentFile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: -1, flexWrap: 'wrap', minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'error.main', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {t('temp_order_attachment_removed')}
                </Typography>
                <Button size="small" onClick={() => setRemoveAttachment(false)}>
                  {t('undo_label')}
                </Button>
              </Box>
            )}

            <Autocomplete
              options={customerOptions}
              value={selectedCustomer}
              getOptionLabel={(opt) => String(opt?.kd_Name1 || opt?.kd_Name2 || opt?.kd_KdNR || '')}
              onChange={(e, value) => onChooseCustomer(value)}
              inputValue={customerQuery}
              onInputChange={(e, value) => setCustomerQuery(value)}
              renderInput={(params) => <TextField {...params} label={t('customer_select')} fullWidth />}
            />

            <TextField label={t('order_customer')} value={form.clientName} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} fullWidth />
            {customerReminderInvoicesCount > 0 && (
              <Typography sx={{ color: 'error.main', fontWeight: 700, whiteSpace: 'pre-line' }}>
                {t('customer_reminder_warning', { count: customerReminderInvoicesCount })}
              </Typography>
            )}
            <TextField label={t('address_label')} value={form.clientAddress} fullWidth disabled />
            <TextField
              select
              label={t('contact_label')}
              value={form.clientRepresentative}
              onChange={(e) => setForm((prev) => ({ ...prev, clientRepresentative: e.target.value }))}
              disabled={!form.clientReferenceId || representativeOptions.length === 0}
              fullWidth
            >
              {representativeOptions.length > 1 && (
                <MenuItem value="">{t('contact_select')}</MenuItem>
              )}
              {representativeOptions.map((representative, index) => (
                <MenuItem
                  key={representative.id ?? `${representative.name}-${representative.email}-${index}`}
                  value={representative.name}
                >
                  <Box sx={{ display: 'grid' }}>
                    <Typography variant="body2">{representative.name}</Typography>
                    {(representative.ranking || representative.position || representative.email) && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {[
                          representative.ranking ? t('contact_rank_value', { rank: representative.ranking }) : '',
                          representative.position,
                          representative.email,
                        ].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <TextField multiline minRows={3} label={t('order_comment')} value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} fullWidth />

            <TextField
              select
              label={t('incoterm_label')}
              value={form.incotermId ?? ''}
              onChange={(e) => {
                const selectedId = Number(e.target.value);
                const selected = incotermOptions.find((z) => Number(z.id) === selectedId);
                setForm((p) => ({
                  ...p,
                  incotermId: Number.isFinite(selectedId) ? selectedId : '',
                  incotermText: selected?.text || '',
                }));
              }}
              fullWidth
            >
              {incotermOptions.map((z) => (
                <MenuItem key={z.id} value={z.id}>{z.text}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('packaging_type_label')}
              value={form.packagingType || ''}
              onChange={(e) => {
                packagingTouchedRef.current = true;
                setForm((p) => ({ ...p, packagingType: e.target.value }));
              }}
              fullWidth
            >
              <MenuItem value="" disabled>{t('packaging_type_select')}</MenuItem>
              {form.packagingType
                && !packagingOptions.some((option) => String(option).toLowerCase() === String(form.packagingType).toLowerCase())
                && <MenuItem value={form.packagingType}>{form.packagingType}</MenuItem>}
              {packagingOptions.map((z) => (
                <MenuItem key={z} value={z}>{z}</MenuItem>
              ))}
            </TextField>
            {packagingSelectionState.mixed && (
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.5 }}>
                {t('packaging_types_mixed_hint')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              {form.deliveryAddressManual ? (
                <TextField
                  label={t('delivery_address_label')}
                  value={form.deliveryAddress || ''}
                  onChange={(e) => setForm((p) => ({ ...p, deliveryAddress: e.target.value, deliveryAddressId: '' }))}
                  fullWidth
                  sx={{ flex: 1, minWidth: 0 }}
                />
              ) : (
                <TextField
                  select
                  label={t('delivery_address_label')}
                  value={form.deliveryAddressId || ''}
                  onChange={(e) => {
                    const selectedId = String(e.target.value || '');
                    const selected = deliveryAddressOptions.find((address) => String(address?.id || '') === selectedId);
                    setForm((p) => ({
                      ...p,
                      deliveryAddress: selected?.text || '',
                      deliveryAddressId: selected?.id || '',
                    }));
                  }}
                  fullWidth
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    '& .MuiSelect-select': {
                      minWidth: 0,
                      overflow: 'hidden',
                    },
                  }}
                  SelectProps={{
                    renderValue: (selected) => {
                      if (!String(selected || '').trim()) {
                        return String(form.deliveryAddress || '').trim()
                          || (deliveryAddressOptions.length > 1 ? t('delivery_address_select') : '-');
                      }
                      const hit = deliveryAddressOptions.find((addr) => String(addr.id || '') === String(selected || ''));
                      return hit ? renderDeliveryAddressOption(hit) : String(form.deliveryAddress || selected || '');
                    },
                  }}
                >
                  <MenuItem value="" disabled={deliveryAddressOptions.length > 1}>
                    {deliveryAddressOptions.length > 1 ? t('delivery_address_select') : '-'}
                  </MenuItem>
                  {deliveryAddressOptions.map((addr) => (
                    <MenuItem key={`${addr.id}-${addr.text}`} value={addr.id}>
                      {renderDeliveryAddressOption(addr)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <IconButton
                size="small"
                onClick={() => setForm((p) => ({
                  ...p,
                  deliveryAddress: '',
                  deliveryAddressId: '',
                  deliveryAddressManual: !p.deliveryAddressManual,
                }))}
              >
                {form.deliveryAddressManual ? <RemoveCircleOutlineIcon fontSize="small" /> : <AddCircleOutlineIcon fontSize="small" />}
              </IconButton>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', pl: 0.5, mt: -0.35, overflowWrap: 'anywhere' }}>
              {t('current_payment_condition')}: {customerPaymentDefaultText || t('payment_select_placeholder')}
            </Typography>
            <FormControlLabel
              sx={{ m: 0, minWidth: 0, '& .MuiFormControlLabel-label': { overflowWrap: 'anywhere' } }}
              control={(
                <Checkbox
                  checked={Boolean(form.specialPaymentCondition)}
                  onChange={(e) => setForm((p) => {
                    if (!e.target.checked) {
                      return {
                        ...p,
                        specialPaymentCondition: false,
                        specialPaymentId: customerPaymentDefaultId || p.specialPaymentId || '',
                        specialPaymentText: customerPaymentDefaultId
                          ? (resolvePaymentTextById(customerPaymentDefaultId)?.text || customerPaymentDefaultText || '')
                          : (p.specialPaymentText || ''),
                      };
                    }
                    if (customerPaymentDefaultId) {
                      const resolvedDefault = resolvePaymentTextById(customerPaymentDefaultId);
                      return {
                        ...p,
                        specialPaymentCondition: true,
                        specialPaymentId: customerPaymentDefaultId,
                        specialPaymentText: resolvedDefault?.text || customerPaymentDefaultText || '',
                      };
                    }
                    return {
                      ...p,
                      specialPaymentCondition: true,
                    };
                  })}
                />
              )}
              label={t('special_payment_condition')}
            />
            {(Boolean(form.specialPaymentCondition) || !customerPaymentDefaultId) && (
              <TextField
                select
                label={t('special_payment_text_label')}
                value={form.specialPaymentId ?? ''}
                onChange={(e) => {
                  const selectedId = Number(e.target.value);
                  const selected = paymentTextOptionsWithSelection.find((z) => Number(z.id) === selectedId);
                  setForm((p) => ({
                    ...p,
                    specialPaymentId: Number.isFinite(selectedId) ? selectedId : '',
                    specialPaymentText: selected?.text || '',
                  }));
                }}
                fullWidth
                SelectProps={{
                  onOpen: () => {
                    if (paymentTextOptions.length > 0) return;
                    void apiRequest('/temp-orders/payment-texts')
                      .then((res) => {
                        const options = Array.isArray(res?.data) ? res.data : [];
                        if (options.length > 0) setPaymentTextOptions(options);
                      })
                      .catch(() => {});
                  },
                }}
              >
                <MenuItem value="" disabled>{t('payment_select_placeholder')}</MenuItem>
                {paymentTextOptionsWithSelection.map((z) => (
                  <MenuItem key={z.id} value={z.id}>{z.text}</MenuItem>
                ))}
              </TextField>
            )}

            {isPositionsMode && (
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {t('order_positions_count')}: {positions.length}
                  </Typography>
                  {isPositionsMode && (
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="add-position"
                      onClick={() => {
                        setAddPosOpen(true);
                        setAddPosError('');
                        setAddPosQuery('');
                        setAddPosOptions([]);
                        setAddPosProduct(null);
                        setAddPosQty('');
                        setAddPosSalePrice('');
                        setAddPosDeliveryDate(tomorrow());
                        setAddPosDeliveryDateAuto(true);
                        setAddPosWpzId(null);
                        setAddPosWpzOriginal(true);
                        setAddPosWpzComment('Original verwenden');
                        setAddPosOriginalPackagingType('');
                        addPosPackagingBeNumberRef.current = '';
                      }}
                    >
                      <AddCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {positions.map((x, idx) => {
                    const foreignMandant = findForeignMandantName(x.beNumber, mandants, activeMandant);
                    const positionKey = getPositionKey(x, idx);
                    const isEditingArticle = editingArticleKey === positionKey;
                    return (
                      <Accordion key={positionKey} disableGutters>
                      <AccordionSummary
                        expandIcon={<ExpandCollapseIndicator accordion />}
                        sx={{ minWidth: 0, '& .MuiAccordionSummary-content': { minWidth: 0 } }}
                      >
                          <Box sx={{ display: 'grid', width: '100%', minWidth: 0, gap: 0.35 }}>
                            {isEditingArticle ? (
                              <Box
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <TextField
                                  autoFocus
                                  size="small"
                                  value={editingArticleValue}
                                  onChange={(event) => setEditingArticleValue(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      saveArticleEdit(x, idx, event);
                                    }
                                    if (event.key === 'Escape') cancelArticleEdit(event);
                                  }}
                                  onBlur={(event) => saveArticleEdit(x, idx, event)}
                                  inputProps={{ 'aria-label': t('article_name_edit') }}
                                  sx={{
                                    flex: 1,
                                    minWidth: 0,
                                    '& .MuiInputBase-input': {
                                      fontSize: '0.875rem',
                                      fontWeight: 700,
                                    },
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={t('article_name_save')}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={(event) => saveArticleEdit(x, idx, event)}
                                >
                                  <CheckIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  aria-label={t('article_name_cancel')}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={cancelArticleEdit}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ minWidth: 0, flex: 1, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                                  {x.article || '-'}
                                </Typography>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={t('article_name_edit')}
                                  title={t('article_name_edit')}
                                  disabled={Boolean(foreignMandant)}
                                  onClick={(event) => beginArticleEdit(x, idx, event)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  aria-label={t('position_split_title')}
                                  title={t('position_split_title')}
                                  disabled={Boolean(foreignMandant) || !calculatePositionSplit(x.amountInKg, 1).ok}
                                  onClick={(event) => openSplitDialog(x, idx, event)}
                                >
                                  <CallSplitOutlinedIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  aria-label={t('delete_label')}
                                  title={t('delete_label')}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onRemovePosition(idx);
                                  }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            )}
                            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              {t('product_be_number')}: {x.beNumber || '-'} | {t('product_storage_id')}: {x.warehouseId || '-'}
                            </Typography>
                            <Typography variant="caption" sx={{ minWidth: 0, opacity: 0.75, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                              {t('original_packaging_type_label')}: {x.originalPackagingType || '-'}
                            </Typography>
                            {foreignMandant && (
                              <Typography variant="caption" sx={{ color: '#C56A00', overflowWrap: 'anywhere' }}>
                                {t('article_from_mandant', { name: foreignMandant })}
                              </Typography>
                            )}
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ display: 'grid', gap: 1.1, minWidth: 0 }}>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                            <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
                              <TextField
                                type="date"
                                label={t('delivery_date')}
                                value={x.deliveryDate || ''}
                                onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? {
                                  ...p,
                                  deliveryDate: e.target.value,
                                  deliveryDateAuto: false,
                                } : p)))}
                                InputLabelProps={{ shrink: true }}
                                size="small"
                              />
                              <DeliveryDateHint status={deliveryDateStatuses[String(x.deliveryDate || '').slice(0, 10)]} t={t} />
                            </Box>
                            <TextField
                              type="number"
                              label={t('product_amount')}
                              value={x.amountInKg ?? ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, amountInKg: e.target.value } : p)))}
                              inputProps={{ min: 1, step: 'any' }}
                              size="small"
                            />
                            <Box sx={{ display: 'grid', gap: 0.25 }}>
                              <TextField
                                type="number"
                                label={t('order_sale_price')}
                                value={x.price ?? ''}
                                onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, price: e.target.value } : p)))}
                                inputProps={{ min: 0.01, step: 'any' }}
                                size="small"
                              />
                              <SaleMarginHint salePrice={x.price} costPrice={x.costPrice} />
                            </Box>
                            <TextField
                              type="number"
                              label={t('product_price')}
                              value={x.costPrice ?? ''}
                              onChange={(e) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, costPrice: e.target.value } : p)))}
                              inputProps={{ min: 0.01, step: 'any' }}
                              size="small"
                            />
                          </Box>
                          <WpzCommentField
                            wpzId={x.wpzId}
                            wpzOriginal={x.wpzOriginal}
                            wpzComment={x.wpzComment}
                            onChange={(patch) => setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))}
                            helperText={t('validation_wpz_individual_required')}
                          />
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" onClick={submit} disabled={saving || deletingOrder}>
                {t('save_label')}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Dialog open={validationOpen} onClose={() => setValidationOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('validation_dialog_title')}</DialogTitle>
        <DialogContent>
          <Box component="ul" sx={{ my: 0, pl: 3 }}>
            {validationMessages.map((msg, idx) => (
              <li key={`${msg}-${idx}`}>
                <Typography variant="body2">{msg}</Typography>
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValidationOpen(false)}>{t('back_label')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteLastConfirmOpen} onClose={() => (!deletingOrder ? setDeleteLastConfirmOpen(false) : undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{t('temp_order_delete_last_position_title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('temp_order_delete_last_position_text')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteLastConfirmOpen(false)} disabled={deletingOrder}>{t('back_label')}</Button>
          <Button color="error" variant="contained" onClick={deleteOrder} disabled={deletingOrder}>
            {t('delete_label')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addPosOpen} onClose={() => setAddPosOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('product_select')}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25 }}>
          {addPosError && <Alert severity="error">{addPosError}</Alert>}
          <Autocomplete
            options={addPosOptionsWithSelection}
            value={addPosProduct}
            isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
            getOptionLabel={(opt) => String(opt?.article || '')}
            getOptionDisabled={(option) => {
              const available = Number(option?.availableAmount);
              if (Number.isFinite(available)) return available <= 0;
              return Math.max(Number(option?.amount || 0) - Number(option?.reserved || 0), 0) <= 0;
            }}
            onChange={(e, value) => {
              setAddPosProduct(value);
              const backendAvailable = Number(value?.availableAmount);
              const available = Number.isFinite(backendAvailable)
                ? Math.max(backendAvailable, 0)
                : Math.max(Number(value?.amount || 0) - Number(value?.reserved || 0), 0);
              setAddPosQty(value && Number.isFinite(available) ? String(available) : '');
              setAddPosSalePrice('');
              setAddPosWpzId(null);
              setAddPosWpzOriginal(true);
              setAddPosWpzComment('Original verwenden');
              setAddPosOriginalPackagingType('');
              addPosPackagingBeNumberRef.current = String(value?.beNumber || '').trim();
              if (value?.id) {
                void loadOriginalPackagingType(value.beNumber).then((originalPackagingType) => {
                  if (addPosPackagingBeNumberRef.current === String(value.beNumber || '').trim()) {
                    setAddPosOriginalPackagingType(originalPackagingType);
                  }
                });
                (async () => {
                  try {
                    const wpzRes = await apiRequest(`/products/${encodeURIComponent(value.id)}/wpz`);
                    const idNum = Number(wpzRes?.data?.wpzId);
                    setAddPosWpzId(Number.isFinite(idNum) && idNum > 0 ? idNum : null);
                  } catch {
                    setAddPosWpzId(null);
                  }
                })();
              }
            }}
            inputValue={addPosQuery}
            onInputChange={(e, value) => setAddPosQuery(value)}
            renderOption={(props, option) => (
              <Box
                component="li"
                {...props}
                sx={{
                  display: 'flex !important',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: 0.1,
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <Typography variant="body2" sx={{ width: '100%', textAlign: 'left' }}>
                  {String(option?.article || '')}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', width: '100%', textAlign: 'left' }}>
                  {`${String(option?.warehouse || '-')}; ${Number.isFinite(Number(option?.availableAmount))
                    ? Number(option.availableAmount)
                    : (option?.amount ?? '-')} ${String(option?.unit || 'kg')}; ${Number.isFinite(Number(option?.acquisitionPrice))
                    ? Number(option.acquisitionPrice).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '-'} EUR`}
                </Typography>
              </Box>
            )}
            renderInput={(params) => <TextField {...params} label={t('product_select')} fullWidth />}
          />
          <TextField
            type="number"
            label={t('product_amount')}
            value={addPosQty}
            onChange={(e) => setAddPosQty(e.target.value)}
            inputProps={{ min: 1, step: 'any' }}
            fullWidth
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: -0.5 }}>
            {addPosAvailableAmount === null
              ? `${t('product_available_now')}: -`
              : `${t('product_available_now')}: ${addPosAvailableAmount} ${String(addPosProduct?.unit || 'kg')}`}
          </Typography>
          <TextField
            type="number"
            label={t('order_sale_price')}
            value={addPosSalePrice}
            onChange={(e) => setAddPosSalePrice(e.target.value)}
            inputProps={{ min: 0.01, step: 'any' }}
            fullWidth
          />
          <SaleMarginHint salePrice={addPosSalePrice} costPrice={addPosProduct?.acquisitionPrice} />
          {addPosProduct && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('original_packaging_type_label')}: {addPosOriginalPackagingType || '-'}
            </Typography>
          )}
          <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
            <TextField
              type="date"
              label={t('delivery_date')}
              value={addPosDeliveryDate || ''}
              onChange={(e) => {
                setAddPosDeliveryDate(e.target.value);
                setAddPosDeliveryDateAuto(false);
              }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <DeliveryDateHint status={deliveryDateStatuses[String(addPosDeliveryDate || '').slice(0, 10)]} t={t} />
          </Box>
          {addPosProduct && (
            <WpzCommentField
              wpzId={addPosWpzId}
              wpzOriginal={addPosWpzOriginal}
              wpzComment={addPosWpzComment}
              onChange={({ wpzOriginal, wpzComment }) => {
                setAddPosWpzOriginal(wpzOriginal);
                setAddPosWpzComment(wpzComment);
              }}
              helperText={t('validation_wpz_individual_required')}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPosOpen(false)}>{t('back_label')}</Button>
          <Button
            variant="contained"
            onClick={() => {
              const qty = Number(addPosQty);
              const salePrice = Number(addPosSalePrice);
              const product = addPosProduct;
              if (!product) {
                setAddPosError(t('validation_product_required'));
                return;
              }
              if (!Number.isFinite(qty) || qty <= 0) {
                setAddPosError(t('validation_amount_positive'));
                return;
              }
              const price = Number(product.acquisitionPrice);
              if (!Number.isFinite(price) || price <= 0) {
                setAddPosError(t('validation_price_positive'));
                return;
              }
              if (!Number.isFinite(salePrice) || salePrice <= 0) {
                setAddPosError(t('validation_sale_price_positive'));
                return;
              }
              if (!String(addPosDeliveryDate || '').trim()) {
                setAddPosError(t('validation_delivery_date_required'));
                return;
              }
              if (addPosWpzId && !String(addPosWpzComment || '').trim()) {
                setAddPosError(t('validation_wpz_individual_required'));
                return;
              }
              setAddPosError('');
              setPositions((prev) => ([
                ...prev,
                {
                  id: null,
                  clientKey: createClientPositionKey(product.beNumber),
                  beNumber: String(product.beNumber || '').trim(),
                  warehouseId: String(product.storageId || '').trim(),
                  article: product.article,
                  amountInKg: qty,
                  price: salePrice,
                  costPrice: price,
                  originalPackagingType: addPosOriginalPackagingType,
                  packagingTypeChanged: false,
                  reservationInKg: null,
                  reservationDate: null,
                  ...createPositionDefaults({
                    deliveryDate: addPosDeliveryDate || tomorrow(),
                    deliveryDateAuto: addPosDeliveryDateAuto,
                    wpzId: addPosWpzId,
                    wpzOriginal: addPosWpzOriginal,
                    wpzComment: addPosWpzComment || '',
                  }),
                },
              ]));
              setAddPosError('');
              setAddPosOpen(false);
            }}
          >
            {t('save_label')}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(splitPosition)} onClose={closeSplitDialog} fullWidth maxWidth="xs">
        <DialogTitle>{t('position_split_title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            type="number"
            label={t('position_split_keep_amount')}
            value={splitKeptQuantity}
            onChange={(event) => {
              setSplitKeptQuantity(event.target.value);
              setSplitError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirmSplit();
              }
            }}
            inputProps={{ min: 1, max: Math.max(Number(splitPosition?.amountInKg || 0) - 1, 1), step: 'any' }}
            error={Boolean(splitError)}
            helperText={splitError || t('position_split_minimum')}
          />
          {splitPreview.ok && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('position_split_new_amount', { amount: splitPreview.remainder })}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSplitDialog}>{t('back_label')}</Button>
          <Button variant="contained" onClick={confirmSplit}>{t('position_split_action')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

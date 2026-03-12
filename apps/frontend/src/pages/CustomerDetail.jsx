import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
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
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

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

function truncateActivityText(value, maxLength = 30) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function InfoRow({ icon, label, value, link, forceRight = false }) {
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
  const [offerScope, setOfferScope] = React.useState('90d');
  const [orderScope, setOrderScope] = React.useState('open');
  const [invoiceScope, setInvoiceScope] = React.useState('open');
  const [purchasedArticlesQuery, setPurchasedArticlesQuery] = React.useState('');
  const [expandedActivities, setExpandedActivities] = React.useState({});
  const [expandedRepresentatives, setExpandedRepresentatives] = React.useState({});
  const [docs, setDocs] = React.useState({
    offers: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    orders: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    invoices: { expanded: false, loaded: false, loading: false, error: '', items: [] },
    purchasedArticles: { expanded: false, loaded: false, loading: false, error: '', items: [] },
  });

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
  const addressLink = addressForMap
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressForMap)}`
    : '';
  const homepageRaw = item?.kd_HomePage ? String(item.kd_HomePage).trim() : '';
  const homepageLink = homepageRaw
    ? (/^https?:\/\//i.test(homepageRaw) ? homepageRaw : `https://${homepageRaw}`)
    : '';
  const salesRep = item?.kd_Aussendienst ? String(item.kd_Aussendienst).trim() : '';
  const reminderInvoicesCount = Number(item?.reminderInvoicesCount) || 0;
  const activities = Array.isArray(item?.activities) ? item.activities : [];
  const representatives = normalizeRepresentatives(item);
  const offerEndpoint = `/customers/${encodeURIComponent(id)}/offers?scope=${encodeURIComponent(offerScope)}`;
  const orderEndpoint = `/customers/${encodeURIComponent(id)}/orders?scope=${encodeURIComponent(orderScope)}`;
  const invoiceEndpoint = `/customers/${encodeURIComponent(id)}/invoices?scope=${encodeURIComponent(invoiceScope)}`;
  const purchasedArticlesEndpoint = `/customers/${encodeURIComponent(id)}/purchased-articles`;
  const filteredPurchasedArticles = React.useMemo(() => {
    const query = String(purchasedArticlesQuery || '').trim().toLowerCase();
    const items = Array.isArray(docs.purchasedArticles.items) ? docs.purchasedArticles.items : [];
    if (!query) return items;
    return items.filter((itemRow) => String(itemRow?.article || '').toLowerCase().includes(query));
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
    const nextScope = event.target.value === 'all' ? 'all' : 'open';
    setInvoiceScope(nextScope);
    if (docs.invoices.expanded) {
      loadDocSection('invoices', `/customers/${encodeURIComponent(id)}/invoices?scope=${encodeURIComponent(nextScope)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        invoices: { ...prev.invoices, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.invoices.expanded, id, loadDocSection]);

  const handleOfferScopeChange = React.useCallback((event) => {
    const nextScope = event.target.value === 'year' ? 'year' : '90d';
    setOfferScope(nextScope);
    if (docs.offers.expanded) {
      loadDocSection('offers', `/customers/${encodeURIComponent(id)}/offers?scope=${encodeURIComponent(nextScope)}`);
    } else {
      setDocs((prev) => ({
        ...prev,
        offers: { ...prev.offers, loaded: false, items: [], error: '' },
      }));
    }
  }, [docs.offers.expanded, id, loadDocSection]);

  const handleOrderScopeChange = React.useCallback((event) => {
    const nextScope = event.target.value === 'all' ? 'all' : 'open';
    setOrderScope(nextScope);
    if (docs.orders.expanded) {
      loadDocSection('orders', `/customers/${encodeURIComponent(id)}/orders?scope=${encodeURIComponent(nextScope)}`);
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
                      <RadioGroup
                        row
                        value={offerScope}
                        onChange={handleOfferScopeChange}
                        sx={{
                          flexWrap: 'nowrap',
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
                        <FormControlLabel
                          value="90d"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('offer_scope_90d')}
                        />
                        <FormControlLabel
                          value="year"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('offer_scope_year')}
                        />
                      </RadioGroup>
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
                      <RadioGroup
                        row
                        value={orderScope}
                        onChange={handleOrderScopeChange}
                        sx={{
                          flexWrap: 'nowrap',
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
                        <FormControlLabel
                          value="open"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('order_scope_open')}
                        />
                        <FormControlLabel
                          value="all"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('order_scope_all')}
                        />
                      </RadioGroup>
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
                          {`${pIdx + 1}. ${pos.article || '-'}; ${pos.amount ?? '-'} ${pos.unit || ''}; ${formatDateOnly(pos.deliveryDate)}; ${formatMoney(pos.salePrice)}`}
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
                      <RadioGroup
                        row
                        value={invoiceScope}
                        onChange={handleInvoiceScopeChange}
                        sx={{
                          flexWrap: 'nowrap',
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
                        <FormControlLabel
                          value="open"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('invoice_scope_open')}
                        />
                        <FormControlLabel
                          value="all"
                          control={<Radio size="small" sx={{ p: 0.35, mr: 0.15 }} />}
                          label={t('invoice_scope_all')}
                        />
                      </RadioGroup>
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
                      <Typography variant="caption">{t('invoice_date_label')}: {formatDateOnly(invoice.invoiceDate)}</Typography>
                      <Typography variant="caption">{t('due_date_label')}: {formatDateOnly(invoice.dueDate)}</Typography>
                      <Typography variant="caption">{t('payment_terms_label')}: {invoice.paymentText || '-'}</Typography>
                      <Typography variant="caption">
                        {t('amount_label')}: {formatMoney(invoice.amount)} ({invoice.isPaid ? t('invoice_status_paid') : t('invoice_status_open')})
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
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticles.length === 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('customer_docs_empty_purchased_articles')}</Typography>
                )}
                {!docs.purchasedArticles.loading && !docs.purchasedArticles.error && filteredPurchasedArticles.map((article, idx) => (
                  <Card
                    key={article.id || `${article.article}-${idx}`}
                    variant="outlined"
                    sx={article.productId ? { cursor: 'pointer' } : undefined}
                    onClick={article.productId
                      ? () => navigate(`/products/${encodeURIComponent(article.productId)}`)
                      : undefined}
                  >
                    <CardContent sx={{ py: '8px !important', px: '10px !important' }}>
                      <Typography
                        variant="body2"
                        sx={article.productId ? { color: 'primary.main', textDecoration: 'underline' } : undefined}
                      >
                        {article.article || '-'}
                      </Typography>
                    </CardContent>
                  </Card>
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
              link={addressLink || undefined}
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
    </Box>
  );
}

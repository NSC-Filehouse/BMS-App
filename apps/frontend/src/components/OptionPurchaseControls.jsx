import React from 'react';
import { Alert, Autocomplete, Box, Button, IconButton, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { optionArticleBlocked } from '../utils/optionDisplay.js';
import OptionPurchaseDialog from './OptionPurchaseDialog.jsx';

const listboxProps = { sx: { '& .MuiAutocomplete-option': { overflowWrap: 'anywhere' } } };

export default function OptionPurchaseControls({ enabled, offer, position, preferredSupplierId, returnTo, renderDetails, onCustomerOrder }) {
  const { t } = useI18n();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers, setSuppliers] = React.useState(null);
  const [selectedSupplier, setSelectedSupplier] = React.useState(null);
  const automaticSupplier = suppliers?.find(row => row.preferred) || (suppliers?.length === 1 ? suppliers[0] : null);
  const supplier = automaticSupplier || selectedSupplier;
  const [supplierError, setSupplierError] = React.useState('');
  const [supplierSearchOpen, setSupplierSearchOpen] = React.useState(false);
  const supplierSearchId = React.useId();
  const [supplierInput, setSupplierInput] = React.useState('');
  const supplierQuery = supplierInput.trim();
  const [supplierResults, setSupplierResults] = React.useState(null);
  const [supplierSearchError, setSupplierSearchError] = React.useState('');
  const [articles, setArticles] = React.useState(null);
  const [article, setArticle] = React.useState(null);
  const [articleError, setArticleError] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchId = React.useId();
  const [articleQuery, setArticleQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState(null);
  const [searchError, setSearchError] = React.useState('');
  const query = articleQuery.trim();
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ q: '', supplierId: preferredSupplierId || '' });
    apiRequest(`${base}/suppliers?${query}`, { signal: controller.signal }).then(({ data = [] }) => {
      if (controller.signal.aborted) return;
      setSuppliers(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setSupplierError(cause.message);
    });
    return () => controller.abort();
  }, [base, enabled, preferredSupplierId]);

  React.useEffect(() => {
    if (!enabled || !supplierSearchOpen || supplierQuery.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest(`${base}/suppliers?${new URLSearchParams({ q: supplierQuery })}`, { signal: controller.signal })
        .then(({ data = [] }) => {
          if (!controller.signal.aborted) setSupplierResults(data.filter(row => row.selectable));
        }).catch(cause => {
          if (!controller.signal.aborted) setSupplierSearchError(cause.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [base, enabled, supplierQuery, supplierSearchOpen]);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiRequest(`${base}/articles?q=`, { signal: controller.signal }).then(({ data = [] }) => {
      if (controller.signal.aborted) return;
      setArticles(rows => rows ? [...data, ...rows.filter(row => !data.some(match => match.articleIndex === row.articleIndex))] : data);
      setArticle(current => current ?? data.find(row => !optionArticleBlocked(row)) ?? null);
    }).catch(cause => {
      if (!controller.signal.aborted) setArticleError(cause.message);
    });
    return () => controller.abort();
  }, [base, enabled]);

  React.useEffect(() => {
    if (!enabled || !searchOpen || query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiRequest(`${base}/articles?${new URLSearchParams({ q: query })}`, { signal: controller.signal })
        .then(({ data = [] }) => {
          if (!controller.signal.aborted) setSearchResults(data);
        }).catch(cause => {
          if (!controller.signal.aborted) setSearchError(cause.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [base, enabled, query, searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setArticleQuery('');
    setSearchResults(null);
    setSearchError('');
  }

  function closeSupplierSearch() {
    setSupplierSearchOpen(false);
    setSupplierInput('');
    setSupplierResults(null);
    setSupplierSearchError('');
  }

  const supplierOptions = {
    isOptionEqualToValue: (a, b) => a.id === b.id,
    getOptionKey: row => row.id,
    getOptionLabel: row => `${row.name}${row.city ? ` · ${row.city}` : ''}`,
    ListboxProps: listboxProps,
  };

  const articleOptions = {
    isOptionEqualToValue: (a, b) => a.articleIndex === b.articleIndex,
    getOptionKey: row => row.articleIndex,
    getOptionLabel: row => row.articleName,
    getOptionDisabled: optionArticleBlocked,
    loadingText: t('purchase_articles_loading'),
    renderOption: ({ key, ...props }, row) => <Box key={key} component="li" {...props} sx={{ display: 'block !important', overflowWrap: 'anywhere' }}>
      {row.articleName}
      {optionArticleBlocked(row) && <Typography display="block" variant="caption" color="error">
        {[...(row.mfiCheck?.reasons || []), ...(row.materialCheck?.reasons || [])].join('; ') || t('purchase_article_mismatch')}
      </Typography>}
    </Box>,
  };

  const supplierField = enabled && !automaticSupplier && (suppliers || supplierError) ?
    <Box sx={{ display: 'grid', gap: 0.5, my: 0.75, minWidth: 0, whiteSpace: 'normal' }}>
      {supplierError && <Alert severity="error">{supplierError}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Autocomplete {...supplierOptions} options={supplier && !suppliers?.some(row => row.id === supplier.id)
          ? [...(suppliers ?? []), supplier] : suppliers ?? []}
          value={supplier} sx={{ flex: 1, minWidth: 0 }}
          noOptionsText={t('purchase_no_supplier_search')}
          onChange={(_event, value) => setSelectedSupplier(value)}
          renderInput={params => <TextField {...params}
            inputProps={{ ...params.inputProps, title: supplier ? params.inputProps.value : undefined }}
            label={t('supplier_label')} required size="small" />} />
        <IconButton aria-label={t('suppliers_search')} title={t('suppliers_search')}
          aria-expanded={supplierSearchOpen} aria-controls={supplierSearchOpen ? supplierSearchId : undefined}
          onClick={() => supplierSearchOpen ? closeSupplierSearch() : setSupplierSearchOpen(true)}><SearchIcon /></IconButton>
      </Box>
      {!supplier && !supplierSearchOpen && suppliers?.length === 0 &&
        <Typography variant="body2" color="text.secondary">{t('purchase_no_supplier_search')}</Typography>}
      {supplierSearchOpen && <Box id={supplierSearchId}>
        {supplierSearchError && <Alert severity="error">{supplierSearchError}</Alert>}
        <Autocomplete {...supplierOptions} options={supplierResults ?? []} value={null} inputValue={supplierInput}
          openOnFocus filterOptions={rows => rows}
          getOptionLabel={row => [row.name, row.name2, row.city, row.id].filter(Boolean).join(' · ')}
          loading={supplierQuery.length >= 2 && !supplierResults && !supplierSearchError}
          noOptionsText={t(supplierQuery.length < 2 ? 'purchase_article_search_minimum' : 'suppliers_search_empty')}
          onInputChange={(_event, value, reason) => {
            if (reason !== 'input' && reason !== 'clear') return;
            if (value.trim() !== supplierQuery) {
              setSupplierResults(null);
              setSupplierSearchError('');
            }
            setSupplierInput(value);
          }}
          onChange={(_event, value) => {
            if (!value) return;
            setSelectedSupplier(value);
            closeSupplierSearch();
          }}
          renderInput={params => <TextField {...params} autoFocus size="small"
            label={t('suppliers_search')} placeholder={t('purchase_supplier_query')} />} />
      </Box>}
    </Box> : null;

  const purchaseControls = <>
    {enabled && <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
      {articleError && <Alert severity="error">{articleError}</Alert>}
      {(position.assignmentMfiCheck?.blocked || position.assignmentMaterialCheck?.blocked) && !article &&
        <Alert severity="warning">{t('purchase_review_article_assignment')}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Autocomplete {...articleOptions} options={articles ?? []} value={article} sx={{ flex: 1, minWidth: 0 }}
          ListboxProps={listboxProps}
          loading={!articles && !articleError}
          noOptionsText={t('purchase_no_article_search')}
          onChange={(_event, value) => setArticle(value)}
          renderInput={params => <TextField {...params}
            inputProps={{ ...params.inputProps, title: article?.articleName }}
            label={t('product_article')} placeholder={t('purchase_select_article')} required size="small" />} />
        <IconButton aria-label={t('purchase_search_article')} title={t('purchase_search_article')}
          aria-expanded={searchOpen} aria-controls={searchOpen ? searchId : undefined}
          onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}><SearchIcon /></IconButton>
      </Box>
      {!searchOpen && articles?.length === 0 && <Typography variant="body2" color="text.secondary">{t('purchase_no_article')}</Typography>}
      {searchOpen && <Box id={searchId}>
        {searchError && <Alert severity="error">{searchError}</Alert>}
        <Autocomplete {...articleOptions} options={searchResults ?? []} value={null} inputValue={articleQuery}
          openOnFocus filterOptions={rows => rows} ListboxProps={listboxProps}
          loading={query.length >= 2 && !searchResults && !searchError}
          noOptionsText={t(query.length < 2 ? 'purchase_article_search_minimum' : 'purchase_article_search_empty')}
          onInputChange={(_event, value, reason) => {
            if (reason !== 'input' && reason !== 'clear') return;
            if (value.trim() !== query) {
              setSearchResults(null);
              setSearchError('');
            }
            setArticleQuery(value);
          }}
          onChange={(_event, value) => {
            if (!value) return;
            setArticles(rows => rows?.some(row => row.articleIndex === value.articleIndex) ? rows : [...(rows ?? []), value]);
            setArticle(value);
            closeSearch();
          }}
          renderInput={params => <TextField {...params} autoFocus size="small"
            label={t('purchase_article_search')} placeholder={t('purchase_article_query')} />} />
      </Box>}
    </Box>}
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
      <Button variant="contained" disabled sx={{ '&.Mui-disabled': { bgcolor: 'grey.100', color: 'text.secondary' } }}>{t('option_counter_option')}</Button>
      {onCustomerOrder && <Button variant="outlined" onClick={() => onCustomerOrder(article)}
        disabled={!article || optionArticleBlocked(article)}>{t('procurement_customer_order')}</Button>}
      <Button variant="contained" onClick={() => setPurchaseOpen(true)}
        disabled={!enabled || !supplier || !article || optionArticleBlocked(article) || position.remainingKg === 0}>{t('purchase_order_action')}</Button>
    </Box>
    {enabled && purchaseOpen && <OptionPurchaseDialog offer={offer} position={position} preferredSupplierId={preferredSupplierId}
      supplier={supplier} supplierEditable={Boolean(automaticSupplier)} article={article} returnTo={returnTo} onClose={() => setPurchaseOpen(false)} />}
  </>;

  return renderDetails({
    supplierField, purchaseControls, article: enabled ? article : null,
    articlePending: enabled && !article && !articles && !articleError,
  });
}

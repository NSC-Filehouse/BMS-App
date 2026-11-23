import React from 'react';
import { Alert, Autocomplete, Box, Button, IconButton, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
import { optionArticleBlocked } from '../utils/optionDisplay.js';
import OptionPurchaseDialog from './OptionPurchaseDialog.jsx';

export default function OptionPurchaseControls({ enabled, offer, position, preferredSupplierId, returnTo }) {
  const { t } = useI18n();
  const base = `/options/${offer.id}/positions/${position.id}/purchase`;
  const [suppliers, setSuppliers] = React.useState(null);
  const [supplier, setSupplier] = React.useState(null);
  const [supplierError, setSupplierError] = React.useState('');
  const [articles, setArticles] = React.useState(null);
  const [article, setArticle] = React.useState(null);
  const [articleError, setArticleError] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchId = React.useId();
  const [articleQuery, setArticleQuery] = React.useState('');
  const [articleSearch, setArticleSearch] = React.useState({ q: '' });
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ q: '', supplierId: preferredSupplierId || '' });
    apiRequest(`${base}/suppliers?${query}`, { signal: controller.signal }).then(({ data = [] }) => {
      if (controller.signal.aborted) return;
      setSuppliers(data);
      setSupplier(data.find(row => row.preferred) || (data.length === 1 ? data[0] : null));
    }).catch(cause => {
      if (!controller.signal.aborted) setSupplierError(cause.message);
    });
    return () => controller.abort();
  }, [base, enabled, preferredSupplierId]);

  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiRequest(`${base}/articles?${new URLSearchParams(articleSearch)}`, { signal: controller.signal }).then(({ data = [] }) => {
      if (controller.signal.aborted) return;
      setArticles(data);
      setArticle(data.length === 1 && !optionArticleBlocked(data[0]) ? data[0] : null);
    }).catch(cause => {
      if (!controller.signal.aborted) setArticleError(cause.message);
    });
    return () => controller.abort();
  }, [articleSearch, base, enabled]);

  function searchArticles() {
    const q = articleQuery.trim();
    if (q.length < 2) return;
    setArticles(null);
    setArticle(null);
    setArticleError('');
    setArticleSearch({ q });
  }

  return <>
    {enabled && <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
      {supplierError && <Alert severity="error">{supplierError}</Alert>}
      {suppliers?.length > 1 && !supplier && <Typography variant="body2">
        {t('purchase_select_supplier', { name: offer.supplierName })}
      </Typography>}
      <Autocomplete options={suppliers ?? []} value={supplier} loading={!suppliers && !supplierError}
        isOptionEqualToValue={(a, b) => a.id === b.id} getOptionKey={row => row.id}
        getOptionLabel={row => `${row.name}${row.city ? ` · ${row.city}` : ''}`}
        noOptionsText={t('supplier_options_unidentified')}
        onChange={(_event, value) => setSupplier(value)}
        renderInput={params => <TextField {...params} label={t('supplier_label')} required size="small" />} />
      {suppliers?.length === 0 && <Typography variant="body2" color="text.secondary">{t('supplier_options_unidentified')}</Typography>}
      {articleError && <Alert severity="error">{articleError}</Alert>}
      {(position.assignmentMfiCheck?.blocked || position.assignmentMaterialCheck?.blocked) && !article &&
        <Alert severity="warning">{t('purchase_review_article_assignment')}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Autocomplete options={articles ?? []} value={article} sx={{ flex: 1, minWidth: 0 }}
          isOptionEqualToValue={(a, b) => a.articleIndex === b.articleIndex} getOptionKey={row => row.articleIndex}
          loading={!articles && !articleError} loadingText={t('purchase_articles_loading')}
          getOptionLabel={row => row.articleName} getOptionDisabled={optionArticleBlocked}
          noOptionsText={t('purchase_no_article_search')}
          renderOption={({ key, ...props }, row) => <Box key={key} component="li" {...props} sx={{ display: 'block !important', overflowWrap: 'anywhere' }}>
            {row.articleName}
            {optionArticleBlocked(row) && <Typography display="block" variant="caption" color="error">
              {[...(row.mfiCheck?.reasons || []), ...(row.materialCheck?.reasons || [])].join('; ') || t('purchase_article_mismatch')}
            </Typography>}
          </Box>}
          onChange={(_event, value) => setArticle(value)}
          renderInput={params => <TextField {...params} label={t('product_article')} placeholder={t('purchase_select_article')} required size="small" />} />
        <IconButton aria-label={t('purchase_search_article')} title={t('purchase_search_article')}
          aria-expanded={searchOpen} aria-controls={searchOpen ? searchId : undefined} onClick={() => setSearchOpen(open => !open)}><SearchIcon /></IconButton>
      </Box>
      {articles?.length === 0 && <Typography variant="body2" color="text.secondary">{t('purchase_no_article')}</Typography>}
      {searchOpen && <Box id={searchId} sx={{ display: 'flex', gap: 1 }}>
        <TextField autoFocus size="small" fullWidth label={t('purchase_article_search')} placeholder={t('purchase_article_query')}
          value={articleQuery} onChange={event => setArticleQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') searchArticles(); }} />
        <Button disabled={articleQuery.trim().length < 2} onClick={searchArticles}>{t('purchase_search')}</Button>
      </Box>}
    </Box>}
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
      <Button variant="contained" disabled sx={{ '&.Mui-disabled': { bgcolor: 'grey.100', color: 'text.secondary' } }}>{t('option_counter_option')}</Button>
      <Button variant="contained" onClick={() => setPurchaseOpen(true)}
        disabled={!enabled || !supplier || !article || optionArticleBlocked(article) || position.remainingKg === 0}>{t('purchase_order_action')}</Button>
    </Box>
    {enabled && purchaseOpen && <OptionPurchaseDialog offer={offer} position={position} preferredSupplierId={preferredSupplierId}
      supplier={supplier} article={article} returnTo={returnTo} onClose={() => setPurchaseOpen(false)} />}
  </>;
}

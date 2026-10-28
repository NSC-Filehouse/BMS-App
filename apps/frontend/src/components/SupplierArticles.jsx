import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';
import { getPurchaseCartItems, purchaseArticleKey, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';
import { supplierArticleList } from '../utils/supplierArticles.js';

export default function SupplierArticles({ groups, loaded, loading, error, onLoad, onPurchase, onSales, canPurchase, initialState }) {
  const [query, setQuery] = React.useState(initialState?.query || '');
  const [expanded, setExpanded] = React.useState(typeof initialState?.expanded === 'boolean' ? initialState.expanded : Boolean(initialState?.expanded?.vl || initialState?.expanded?.other));
  const [working, setWorking] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const [detail, setDetail] = React.useState(null);
  const [cart, setCart] = React.useState(getPurchaseCartItems);
  const restored = React.useRef(false);
  React.useEffect(() => { if (!loaded && !loading) onLoad(); }, [loaded, loading, onLoad]);
  React.useEffect(() => {
    const sync = () => setCart(getPurchaseCartItems());
    window.addEventListener(PURCHASE_CART_CHANGED, sync);
    return () => window.removeEventListener(PURCHASE_CART_CHANGED, sync);
  }, []);
  React.useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    if (initialState?.scrollTop) requestAnimationFrame(() => window.scrollTo(0, initialState.scrollTop));
  }, [initialState, loaded]);
  const cartKeys = new Set(cart.map(purchaseArticleKey));
  const articles = supplierArticleList(groups, query);
  const action = async (kind, row) => {
    if (working) return;
    setWorking(true); setActionError('');
    const snapshot = { query, expanded, scrollTop: window.scrollY };
    try { await (kind === 'sale' ? onSales([row], snapshot) : onPurchase([row], snapshot)); }
    catch (e) { setActionError(e.message); }
    finally { setWorking(false); }
  };
  return <>
    <Accordion expanded={expanded} onChange={(_event, open) => setExpanded(open)}>
      <AccordionSummary expandIcon={<ExpandCollapseIndicator accordion />}><Typography>Bereits eingekaufte Artikel</Typography></AccordionSummary>
      <AccordionDetails sx={{ display: 'grid', gap: 1 }}>
        <TextField size="small" fullWidth label="Artikel suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
        {loading && <CircularProgress size={20} />}{error && <Alert severity="error">{error}</Alert>}{actionError && <Alert severity="error">{actionError}</Alert>}
        {!loading && loaded && !articles.length && <Typography variant="body2" color="text.secondary">Keine Artikel</Typography>}
        {articles.map((article) => <Box key={article.key} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ButtonBase onClick={() => setDetail(article)} sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', py: 0.75 }} aria-label={`Details zu ${article.article}`}>
              <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{article.article}</Typography>
            </ButtonBase>
            {canPurchase && <IconButton size="small" color={cartKeys.has(article.key) ? 'success' : 'primary'} disabled={working || !article.articleIndex}
              title="Beim Lieferanten bestellen" onClick={() => action('purchase', article)} aria-label={`${article.article} zum Bestellwarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>}
          </Box>
          {article.positions.length > 0 && <Box sx={{ pl: 1.25, display: 'grid', gap: 0.25 }}>
            <Typography variant="caption" color="primary">Aktuell auf VL</Typography>
            {article.positions.map((position) => <Box key={position.id || position.productId} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{Number(position.availableAmount).toLocaleString('de-DE')} {position.unit || 'kg'} · {position.warehouse} · BE {position.beNumber}</Typography>
              <IconButton size="small" color="primary" disabled={working || !(position.availableAmount > 0)} title="In einen Kundenauftrag übernehmen"
                onClick={() => action('sale', position)} aria-label={`${article.article} zum Auftragswarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>
            </Box>)}
          </Box>}
        </Box>)}
      </AccordionDetails>
    </Accordion>
    <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
      <DialogTitle>{detail?.article}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1 }}>
        <Typography variant="body2">Artikelindex: {detail?.articleIndex || '–'}</Typography>
        <Typography variant="body2">Artikelbezeichnung beim Lieferanten: {detail?.supplierArticleName || '–'}</Typography>
        {detail?.lastPurchaseArticle && detail.lastPurchaseArticle !== detail.article && <Typography variant="body2">Letzte Einkaufsbezeichnung: {detail.lastPurchaseArticle}</Typography>}
      </DialogContent>
      <DialogActions><Button onClick={() => setDetail(null)}>Schließen</Button></DialogActions>
    </Dialog>
  </>;
}

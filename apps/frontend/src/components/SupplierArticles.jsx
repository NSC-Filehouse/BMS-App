import React from 'react';
import { BackAwareAccordion as Accordion, useBackDisclosure } from './DisclosureBack.jsx';
import { AccordionDetails, AccordionSummary, Alert, Box, ButtonBase, Checkbox, CircularProgress, Collapse, IconButton, TextField, Typography } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';
import { getPurchaseCartItems, purchaseArticleKey, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';
import { supplierArticleList, selectedSupplierVlPositions, supplierVlPositionKey } from '../utils/supplierArticles.js';

export default function SupplierArticles({ groups, loaded, loading, error, onLoad, onPurchase, onSales, canPurchase, initialState }) {
  const [query, setQuery] = React.useState(initialState?.query || '');
  const [expanded, setExpanded] = React.useState(typeof initialState?.expanded === 'boolean' ? initialState.expanded : Boolean(initialState?.expanded?.vl || initialState?.expanded?.other));
  const [working, setWorking] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
  const [expandedVl, setExpandedVl] = React.useState(() => new Set(initialState?.expandedVl || []));
  const [selectedVl, setSelectedVl] = React.useState(() => new Set(initialState?.selectedVl || []));
  useBackDisclosure(expandedVl.size > 0, () => setExpandedVl(new Set()), { active: expanded });
  const vlRegionId = React.useId();
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
  const action = async (kind, rowOrRows) => {
    const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
    if (working || !rows.length) return;
    setWorking(true); setActionError('');
    const snapshot = { query, expanded, expandedVl: [...expandedVl], selectedVl: [...selectedVl], scrollTop: window.scrollY };
    try { await (kind === 'sale' ? onSales(rows, snapshot) : onPurchase(rows, snapshot)); }
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
        {articles.map((article) => {
          const selectedPositions = selectedSupplierVlPositions(article, selectedVl);
          const selectionTitle = 'Ausgewählte VL-Positionen in einen Kundenauftrag übernehmen';
          return <Box key={article.key} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, py: 0.75, overflowWrap: 'anywhere' }}>{article.article}</Typography>
            {canPurchase && <IconButton size="small" color={cartKeys.has(article.key) ? 'success' : 'primary'} disabled={working || !article.articleIndex}
              title={cartKeys.has(article.key) ? 'Bereits im Bestellwarenkorb – öffnen' : 'Beim Lieferanten bestellen'} onClick={() => action('purchase', article)} aria-label={`${article.article} zum Bestellwarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>}
          </Box>
          {article.positions.length > 0 && <Box sx={{ pl: 1.25, display: 'grid', gap: 0.25 }}>
            <ButtonBase aria-expanded={expandedVl.has(article.key)} aria-controls={`${vlRegionId}-${article.key}`}
              aria-label={`VL-Positionen zu ${article.article}`} onClick={() => setExpandedVl((previous) => {
                const next = new Set(previous);
                if (next.has(article.key)) next.delete(article.key); else next.add(article.key);
                return next;
              })} sx={{ justifySelf: 'start', justifyContent: 'flex-start', textAlign: 'left', color: 'primary.main', gap: 0.5, py: 0.25 }}>
              <ExpandCollapseIndicator expanded={expandedVl.has(article.key)} direction="right" />
              <Typography variant="caption">Aktuell auf VL ({article.positions.length})</Typography>
            </ButtonBase>
            <Collapse id={`${vlRegionId}-${article.key}`} in={expandedVl.has(article.key)} unmountOnExit>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{selectedPositions.length} ausgewählt</Typography>
                <IconButton size="small" color="primary" disabled={working || !selectedPositions.length} title={selectionTitle}
                  aria-label={`Ausgewählte VL-Positionen von ${article.article} zum Auftragswarenkorb`} onClick={() => action('sale', selectedPositions)}><ShoppingCartIcon fontSize="small" /></IconButton>
              </Box>
              {article.positions.map((position) => <Box key={position.id || position.productId} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Checkbox size="small" disabled={working || !(position.availableAmount > 0) || !supplierVlPositionKey(position)}
                  checked={selectedPositions.some((p) => supplierVlPositionKey(p) === supplierVlPositionKey(position))}
                  inputProps={{ 'aria-label': `VL-Position ${article.article}, BE ${position.beNumber}, ${position.warehouse} auswählen` }}
                  onChange={(_event, checked) => setSelectedVl((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(supplierVlPositionKey(position)); else next.delete(supplierVlPositionKey(position));
                    return next;
                  })} />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{Number(position.availableAmount).toLocaleString('de-DE')} {position.unit || 'kg'} · {position.warehouse} · BE {position.beNumber}</Typography>
                <IconButton size="small" color="primary" disabled={working || !(position.availableAmount > 0) || !supplierVlPositionKey(position)} title={selectedPositions.length ? selectionTitle : 'In einen Kundenauftrag übernehmen'}
                  onClick={() => action('sale', selectedPositions.length ? selectedPositions : [position])} aria-label={`${article.article} zum Auftragswarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>
              </Box>)}
            </Collapse>
          </Box>}
        </Box>;
        })}
      </AccordionDetails>
    </Accordion>
  </>;
}

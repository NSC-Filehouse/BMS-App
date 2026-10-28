import React from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Checkbox, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';
import { getPurchaseCartItems, purchaseArticleKey, PURCHASE_CART_CHANGED } from '../utils/purchaseCart.js';

export default function SupplierArticles({ groups, loaded, loading, error, onLoad, onPurchase, onSales, canPurchase, initialState }) {
  const [query, setQuery] = React.useState(initialState?.query || '');
  const [expanded, setExpanded] = React.useState(initialState?.expanded || { vl: false, other: false });
  const [selected, setSelected] = React.useState(initialState?.selected || { vl: [], other: [] });
  const [working, setWorking] = React.useState(false);
  const [actionError, setActionError] = React.useState('');
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
  const allParts = { vl: [], other: [] };
  const parts = { vl: [], other: [] };
  for (const group of groups || []) {
    for (const article of group.articles || []) {
      const positions = article.availablePositions || [];
      const section = positions.length ? 'vl' : 'other';
      const entry = { ...article, groupName: group.name, key: purchaseArticleKey(article), positions };
      allParts[section].push(entry);
      const search = `${group.name} ${article.article} ${article.articleIndex} ${positions.map((p) => `${p.beNumber} ${p.warehouse}`).join(' ')}`.toLocaleLowerCase('de-DE');
      if (query && !search.includes(query.toLocaleLowerCase('de-DE'))) continue;
      parts[section].push(entry);
    }
  }
  const toggle = (section, id) => setSelected((previous) => ({ ...previous, [section]: previous[section].includes(id) ? previous[section].filter((key) => key !== id) : [...previous[section], id] }));
  const action = async (section, clicked = null) => {
    const rows = section === 'vl' ? allParts.vl.flatMap((article) => article.positions) : allParts.other;
    const key = (row) => section === 'vl' ? row.id || row.productId : row.key;
    const ids = new Set([...selected[section], ...(clicked ? [key(clicked)] : [])]);
    const chosen = rows.filter((row) => ids.has(key(row)) && (section !== 'vl' || Number(row.availableAmount) > 0));
    if (!chosen.length) return;
    setWorking(true); setActionError('');
    const snapshot = { query, expanded, selected: { ...selected, [section]: [] }, scrollTop: window.scrollY };
    try { await (section === 'vl' ? onSales(chosen, snapshot) : onPurchase(chosen, snapshot)); }
    catch (e) { setActionError(e.message); }
    finally { setWorking(false); }
  };
  return <>
    {['vl', 'other'].map((section) => {
      const available = section === 'vl' ? parts.vl.flatMap((article) => article.positions).filter((p) => p.availableAmount > 0).map((p) => p.id || p.productId) : parts.other.map((p) => p.key);
      const selectedAll = available.length > 0 && available.every((id) => selected[section].includes(id));
      return <Accordion key={section} expanded={expanded[section]} onChange={(_e, open) => setExpanded((previous) => ({ ...previous, [section]: open }))}>
        <AccordionSummary expandIcon={<ExpandCollapseIndicator accordion />}><Typography>{section === 'vl' ? 'Artikel auf VL' : 'Weitere Artikel'}</Typography></AccordionSummary>
        <AccordionDetails sx={{ display: 'grid', gap: 1 }}>
          <TextField size="small" fullWidth label="Artikel suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
          {loading && <CircularProgress size={20} />}{error && <Alert severity="error">{error}</Alert>}{actionError && <Alert severity="error">{actionError}</Alert>}
          {(section === 'vl' || canPurchase) && available.length > 0 && <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox size="small" checked={selectedAll} indeterminate={!selectedAll && available.some((id) => selected[section].includes(id))} disabled={working} inputProps={{ 'aria-label': 'Alle Positionen auswählen' }} onChange={() => setSelected((previous) => ({ ...previous, [section]: selectedAll ? previous[section].filter((id) => !available.includes(id)) : [...new Set([...previous[section], ...available])] }))} />
            <Typography variant="caption" sx={{ flex: 1 }}>{selected[section].length} ausgewählt</Typography>
            <IconButton size="small" color="primary" aria-label="Auswahl in den Warenkorb übernehmen" disabled={working || !selected[section].length} onClick={() => action(section)}><ShoppingCartIcon fontSize="small" /></IconButton>
          </Box>}
          {!loading && loaded && parts[section].length === 0 && <Typography variant="body2" color="text.secondary">Keine Artikel</Typography>}
          {parts[section].map((article) => <Box key={article.key} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 0.75 }}>
            <Typography variant="caption" color="text.secondary">{article.groupName}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {section === 'other' && canPurchase && <Checkbox size="small" checked={selected.other.includes(article.key)} disabled={working} onChange={() => toggle('other', article.key)} inputProps={{ 'aria-label': `${article.article} auswählen` }} />}
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{article.article}</Typography>
              {section === 'other' && canPurchase && <IconButton size="small" color={cartKeys.has(article.key) ? 'success' : 'primary'} disabled={working || !article.articleIndex} onClick={() => action('other', article)} aria-label={`${article.article} zum Bestellwarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>}
            </Box>
            {section === 'vl' && article.positions.map((position) => {
              const id = position.id || position.productId;
              const unavailable = !(position.availableAmount > 0);
              return <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 1 }}>
                <Checkbox size="small" checked={selected.vl.includes(id)} disabled={working || unavailable} onChange={() => toggle('vl', id)} inputProps={{ 'aria-label': `${position.beNumber} auswählen` }} />
                <Typography variant="caption" sx={{ flex: 1 }}>{Number(position.availableAmount).toLocaleString('de-DE')} kg · {position.warehouse} · BE {position.beNumber}</Typography>
                <IconButton size="small" color="primary" disabled={working || unavailable} onClick={() => action('vl', position)} aria-label={`${article.article} zum Auftragswarenkorb`}><ShoppingCartIcon fontSize="small" /></IconButton>
              </Box>;
            })}
          </Box>)}
        </AccordionDetails>
      </Accordion>;
    })}
  </>;
}

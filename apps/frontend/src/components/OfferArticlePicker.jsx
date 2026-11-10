import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

function ArticleLeaf({ group, q, selected, toggle, en }) {
  const [expanded, setExpanded] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (!expanded) return;
    let active = true;
    setLoading(true);
    setError('');
    const p = new URLSearchParams({
      q,
      page: String(page),
      pageSize: '30',
      groupId: group.groupId ?? '',
      plasticId: group.plasticId ?? '',
      subId: group.subId ?? '',
    });
    apiRequest(`/temp-offers/articles?${p}`)
      .then((r) => {
        if (active) setResult(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [expanded, page, q, group.groupId, group.plasticId, group.subId]);
  return (
    <Accordion
      expanded={expanded}
      onChange={(_, v) => setExpanded(v)}
      disableGutters
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>
          {group.sub || group.plastic || (en ? 'Articles' : 'Artikel')} (
          {group.total})
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {loading && <CircularProgress size={22} />}{' '}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading &&
          (result?.data || []).map((a) => (
            <Box
              key={a.articleIndex}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                borderBottom: '1px solid',
                borderColor: 'divider',
                py: 0.5,
              }}
            >
              <Checkbox
                checked={Boolean(selected[a.articleIndex])}
                onChange={() => toggle(a)}
                inputProps={{ 'aria-label': a.article }}
              />
              <Box
                component="button"
                type="button"
                onClick={() => toggle(a)}
                sx={{
                  border: 0,
                  background: 'none',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  p: 1,
                  minWidth: 0,
                }}
              >
                <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                  {a.article}
                </Typography>
                <Typography variant="caption">
                  {a.articleIndex}
                  {a.productNumber ? ` · ${a.productNumber}` : ''}
                  {a.mfi != null
                    ? ` · MFI ${a.mfi}${a.mfiTo != null ? `–${a.mfiTo}` : ''}`
                    : ''}
                </Typography>
              </Box>
            </Box>
          ))}
        {Number(result?.meta?.total) > 30 && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
            <Button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              ←
            </Button>
            <Typography>
              {page} / {Math.ceil(result.meta.total / 30)}
            </Typography>
            <Button
              disabled={page * 30 >= result.meta.total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </Button>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
export default function OfferArticlePicker({ open, onClose, onAdd }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [groups, setGroups] = React.useState([]);
  const [selected, setSelected] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setSelected({});
      setSearch('');
      setQ('');
    }
  }, [open]);
  React.useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    apiRequest(`/temp-offers/article-groups?q=${encodeURIComponent(q)}`)
      .then((r) => {
        if (active) setGroups(r.data || []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, q]);
  const tree = React.useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const key = String(g.groupId ?? '');
      if (!map.has(key))
        map.set(key, {
          name:
            g.groupName ||
            (en ? 'Without article group' : 'Ohne Artikelgruppe'),
          plastics: new Map(),
          total: 0,
        });
      const parent = map.get(key);
      parent.total += Number(g.total);
      const pk = String(g.plasticId ?? '');
      if (!parent.plastics.has(pk))
        parent.plastics.set(pk, {
          name: g.plastic || (en ? 'Other' : 'Sonstige'),
          groups: [],
          total: 0,
        });
      const p = parent.plastics.get(pk);
      p.groups.push(g);
      p.total += Number(g.total);
    }
    return [...map.entries()];
  }, [groups, en]);
  const toggle = (a) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[a.articleIndex]) delete next[a.articleIndex];
      else next[a.articleIndex] = a;
      return next;
    });
  const count = Object.keys(selected).length;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {en ? 'Select active BMS articles' : 'Aktive BMS-Artikel auswählen'}
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          label={
            en
              ? 'Article / index / product number'
              : 'Artikel / Artikelindex / Produktnummer'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ my: 1 }}
        />
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <CircularProgress />
        ) : (
          tree.map(([key, g]) => (
            <Accordion key={`${q}|${key}`} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600}>
                  {g.name} ({g.total})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                {[...g.plastics.entries()].map(([pk, p]) => (
                  <Accordion key={pk} disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>
                        {p.name} ({p.total})
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ p: 0.5 }}>
                      {p.groups.map((s) => (
                        <ArticleLeaf
                          key={`${s.subId ?? ''}`}
                          group={s}
                          q={q}
                          selected={selected}
                          toggle={toggle}
                          en={en}
                        />
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </AccordionDetails>
            </Accordion>
          ))
        )}
        {!loading && !tree.length && (
          <Typography>
            {en
              ? 'No active articles found.'
              : 'Keine aktiven Artikel gefunden.'}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{en ? 'Cancel' : 'Abbrechen'}</Button>
        <Button
          variant="contained"
          disabled={!count || loading}
          onClick={() => onAdd(Object.values(selected))}
        >
          {en ? `Add ${count} articles` : `${count} Artikel übernehmen`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

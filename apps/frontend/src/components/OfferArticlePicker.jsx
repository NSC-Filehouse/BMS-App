import React from 'react';
import {
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
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { BackAwareAccordion as Accordion } from './DisclosureBack.jsx';
import ExpandCollapseIndicator from './ExpandCollapseIndicator.jsx';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';
export default function OfferArticlePicker({ open, onClose, onAdd }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const [search, setSearch] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState(null);
  const [selected, setSelected] = React.useState({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setSelected({});
      setSearch('');
      setQ('');
      setPage(1);
    }
  }, [open]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError('');
    apiRequest(
      `/temp-offers/article-groups?${new URLSearchParams({ q, page: String(page), pageSize: '40' })}`,
    )
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
  }, [open, q, page]);
  const toggle = (a) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[a.articleIndex]) delete next[a.articleIndex];
      else next[a.articleIndex] = a;
      return next;
    });
  const count = Object.keys(selected).length;
  const pages = Math.max(1, Math.ceil((result?.meta?.total || 0) / 40));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { height: '85vh', maxHeight: '90vh' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        {en ? 'Select articles' : 'Artikel auswählen'}
      </DialogTitle>
      <Box sx={{ px: 3, pb: 1, flexShrink: 0 }}>
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
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ opacity: 0.6 }} />
              </InputAdornment>
            ),
          }}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 0.5,
          }}
        >
          <Typography variant="caption">
            {result?.meta?.totalArticles || 0} {en ? 'articles' : 'Artikel'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              size="small"
              disabled={loading || page === 1}
              aria-label={en ? 'Previous page' : 'Vorherige Seite'}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="caption">
              {page}/{pages}
            </Typography>
            <IconButton
              size="small"
              disabled={loading || page >= pages}
              aria-label={en ? 'Next page' : 'Nächste Seite'}
              onClick={() => setPage((p) => p + 1)}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>
      <DialogContent
        dividers
        sx={{ p: 1.5, overflowY: 'auto', flex: 1, minHeight: 0 }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          (result?.data || []).map((group) => (
            <Accordion key={`${q}|${group.key}`} disableGutters>
              <AccordionSummary
                expandIcon={<ExpandCollapseIndicator accordion />}
              >
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{ overflowWrap: 'anywhere' }}
                >
                  {group.name} ({group.availableCount})
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                {group.positions.map((a) => (
                  <Box
                    key={a.articleIndex}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Checkbox
                      checked={Boolean(selected[a.articleIndex])}
                      onChange={() => toggle(a)}
                      inputProps={{ 'aria-label': a.article }}
                    />
                    <Button
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        display: 'grid',
                        textAlign: 'left',
                        justifyContent: 'start',
                        textTransform: 'none',
                        color: 'text.primary',
                      }}
                      onClick={() => toggle(a)}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {a.article}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.articleIndex}
                        {a.productNumber ? ` · ${a.productNumber}` : ''}
                        {a.mfi != null
                          ? ` · MFI ${a.mfi}${a.mfiTo != null ? `–${a.mfiTo}` : ''}`
                          : ''}
                      </Typography>
                    </Button>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          ))
        )}
        {!loading && !error && !result?.data?.length && (
          <Typography>
            {en ? 'No articles found.' : 'Keine Artikel gefunden.'}
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

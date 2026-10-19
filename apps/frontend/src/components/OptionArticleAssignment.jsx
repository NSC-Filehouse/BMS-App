import React from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

export default function OptionArticleAssignment({ optionId, position, onAssigned, sourceQuery, readOnly }) {
  const { t, lang } = useI18n();
  const en = lang === 'en';
  const [candidates, setCandidates] = React.useState(null);
  const [visible, setVisible] = React.useState(5);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [activeQuery, setActiveQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const base = `/options/${encodeURIComponent(optionId)}/positions/${encodeURIComponent(position.id)}`;
  async function loadCandidates(q = '', nextPage = 1) {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams(sourceQuery);
      params.set('page', String(nextPage));
      if (q) params.set('q', q);
      const response = await apiRequest(`${base}/candidates?${params.toString()}`);
      setCandidates(previous => nextPage === 1 ? response?.data || [] : [...(previous || []), ...(response?.data || [])]);
      setTotal(Number(response?.meta?.total || 0)); setPage(nextPage); setActiveQuery(q);
      setVisible(nextPage === 1 ? 5 : nextPage * 30);
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setBusy(false); }
  }
  async function assign(candidate) {
    if (candidate.conflicts?.length && !window.confirm(`${candidate.conflicts.join('\n')}\n\n${en ? 'Assign this article anyway?' : 'Diesen Artikel trotzdem zuordnen?'}`)) return;
    if (candidate.confidence === 'manual' && !window.confirm(en ? 'Assign this article? Technical suitability has not been confirmed.' : 'Diesen Artikel zuordnen? Die technische Eignung wurde nicht bestätigt.')) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`${base}/article`, { method: 'POST', body: JSON.stringify({ articleIndex: candidate.articleIndex, acknowledgeConflict: candidate.conflicts?.length > 0 }) });
      onAssigned();
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setBusy(false); }
  }
  return <Box sx={{ mt: 1.5 }}>
    <Typography variant="body2" sx={{ mb: 1 }}>
      {t('option_internal_article')}: {position.articleIndex ? `${position.internalArticleName} (${position.articleIndex})` : t('option_unassigned')}
    </Typography>
    {!position.articleIndex && position.suggestedArticleIndex && <Alert severity="info" sx={{ mb: 1 }}>
      {t('option_saved_suggestion')}: {position.suggestedArticleName} ({position.suggestedArticleIndex})
      {position.matchReason && <Typography variant="caption" sx={{ display: 'block' }}>{position.matchReason}</Typography>}
    </Alert>}
    <Button size="small" variant="outlined" disabled={busy} onClick={() => loadCandidates()}>{t('option_show_candidates')}</Button>
    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
      <TextField size="small" fullWidth value={query} onChange={event => setQuery(event.target.value)}
        label={en ? 'Find article by name or number' : 'Artikel über Namen oder Nummer suchen'}
        onKeyDown={event => { if (event.key === 'Enter' && query.trim().length >= 2) loadCandidates(query.trim()); }} />
      <Button disabled={busy || query.trim().length < 2} onClick={() => loadCandidates(query.trim())}>{en ? 'Search' : 'Suchen'}</Button>
    </Box>
    {busy && <CircularProgress size={18} sx={{ mt: 1 }} />}
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    {candidates && <Box sx={{ mt: 1, display: 'grid', gap: 0.5 }}>
      <Typography variant="caption">{total} {en ? 'candidates' : 'Kandidaten'}</Typography>
      {candidates.length === 0 && <Typography variant="body2">{t('option_no_candidates')}</Typography>}
      {candidates.slice(0, visible).map(candidate => <Box key={candidate.articleIndex} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
        <Typography variant="body2">{candidate.articleName} ({candidate.articleIndex})</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{candidate.reason}</Typography>
        {candidate.warnings?.map(warning => <Typography key={warning} variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>{warning}</Typography>)}
        {candidate.conflicts?.map(conflict => <Typography key={conflict} variant="caption" sx={{ display: 'block', color: 'error.main' }}>{conflict}</Typography>)}
        {!readOnly && <Button size="small" disabled={busy} onClick={() => assign(candidate)}>{t('option_assign')}</Button>}
      </Box>)}
      {visible < total && <Button disabled={busy} onClick={() => visible < candidates.length ? setVisible(candidates.length) : loadCandidates(activeQuery, page + 1)}>
        {en ? 'Show more candidates' : 'Weitere Kandidaten anzeigen'}
      </Button>}
    </Box>}
  </Box>;
}

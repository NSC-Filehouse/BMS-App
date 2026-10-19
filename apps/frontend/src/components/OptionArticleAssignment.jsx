import React from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
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
  const [historyDetail, setHistoryDetail] = React.useState(null);
  const base = `/options/${encodeURIComponent(optionId)}/positions/${encodeURIComponent(position.id)}`;
  React.useEffect(() => { setCandidates(null); setTotal(0); setPage(0); setVisible(5); }, [position.snapshotId]);
  async function recalculate() {
    setBusy(true); setError('');
    try { await apiRequest(`${base}/recalculate`, { method: 'POST' }); onAssigned(); }
    catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setBusy(false); }
  }
  async function openHistory(candidate, example) {
    setBusy(true); setError('');
    try {
      const response = await apiRequest(`${base}/history/${encodeURIComponent(candidate.articleIndex)}/${encodeURIComponent(example.positionId)}?${sourceQuery || ''}`);
      setHistoryDetail(response?.data || null);
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setBusy(false); }
  }
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
    if(candidate.mfiCheck?.blocked)return;
    if(!candidate.mfiCheck?.complete && !window.confirm(en ? 'MFI suitability is unverified. Assign this article with missing measurement or test conditions?' : 'MFI-Eignung ungeprüft. Diesen Artikel trotz fehlendem Messwert oder unvollständiger Prüfbedingungen zuordnen?'))return;
    if (candidate.conflicts?.length && !window.confirm(`${candidate.conflicts.join('\n')}\n\n${en ? 'Assign this article anyway?' : 'Diesen Artikel trotzdem zuordnen?'}`)) return;
    if (candidate.confidence === 'manual' && !window.confirm(en ? 'Assign this article? Technical suitability has not been confirmed.' : 'Diesen Artikel zuordnen? Die technische Eignung wurde nicht bestätigt.')) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`${base}/article`, { method: 'POST', body: JSON.stringify({ articleIndex: candidate.articleIndex,
        snapshotId: candidate.snapshotId, acknowledgeManual: candidate.confidence === 'manual', acknowledgeConflict: candidate.conflicts?.length > 0,
        acknowledgeUnverifiedMfi:!candidate.mfiCheck?.complete }) });
      onAssigned();
    } catch (cause) { setError(cause?.message || t('loading_error')); }
    finally { setBusy(false); }
  }
  return <Box sx={{ mt: 1.5 }}>
    <Typography variant="body2" sx={{ mb: 1 }}>
      {t('option_internal_article')}: {position.articleIndex ? `${position.internalArticleName} (${position.articleIndex})` : t('option_unassigned')}
    </Typography>
    {position.matchProcessingStatus !== 'ready' && <Alert severity={position.matchProcessingStatus === 'stale' ? 'warning' : 'info'} sx={{ mb: 1 }}>
      {position.matchProcessingStatus === 'stale'
        ? (en ? 'The background update needs attention. Existing saved suggestions remain visible.' : 'Die Aktualisierung benötigt eine Prüfung. Vorhandene gespeicherte Vorschläge bleiben sichtbar.')
        : (en ? 'Article suggestions are being prepared in the background.' : 'Artikelvorschläge werden im Hintergrund vorbereitet.')}
    </Alert>}
    {position.matchCalculatedAt && <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
      {en ? 'Suggestions calculated' : 'Vorschläge berechnet'}: {new Date(position.matchCalculatedAt).toLocaleString(en ? 'en-GB' : 'de-DE')}
      {position.categorySource === 'history' ? ` · ${en ? 'Category inferred from purchasing history' : 'Kategorie aus Einkaufshistorie abgeleitet'}` : ''}
    </Typography>}
    {position.learningNotice && <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>{position.learningNotice}</Typography>}
    {position.assignmentMfiCheck?.blocked && <Alert severity="error" sx={{ mb:1 }}>
      {en ? 'Existing assignment conflicts with MFI' : 'Bestehende Zuordnung widerspricht dem MFI'}: {position.assignmentMfiCheck.reasons.join('; ')}
    </Alert>}
    {!position.articleIndex && position.suggestedArticleIndex && <Alert severity="info" sx={{ mb: 1 }}>
      {t('option_saved_suggestion')}: {position.suggestedArticleName} ({position.suggestedArticleIndex})
      {position.matchReason && <Typography variant="caption" sx={{ display: 'block' }}>{position.matchReason}</Typography>}
    </Alert>}
    <Button size="small" variant="outlined" disabled={busy} onClick={() => loadCandidates()}>{t('option_show_candidates')}</Button>
    {!readOnly && <Button size="small" disabled={busy} onClick={recalculate}>{en ? 'Refresh suggestions' : 'Vorschläge aktualisieren'}</Button>}
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
        {candidate.history?.examples?.map(example => <Button key={example.positionId} size="small" disabled={busy}
          onClick={() => openHistory(candidate, example)} sx={{ display: 'block', textAlign: 'left', textTransform: 'none', fontSize: '0.72rem' }}>
          {`${en ? 'Purchase' : 'Einkauf'} ${example.positionId} · ${example.articleName} · ${example.orderDate ? new Date(`${example.orderDate}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE') : ''}`}
        </Button>)}
        {candidate.warnings?.map(warning => <Typography key={warning} variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>{warning}</Typography>)}
        {candidate.conflicts?.map(conflict => <Typography key={conflict} variant="caption" sx={{ display: 'block', color: 'error.main' }}>{conflict}</Typography>)}
        {!readOnly && <Button size="small" disabled={busy || candidate.mfiCheck?.blocked} onClick={() => assign(candidate)}>{t('option_assign')}</Button>}
      </Box>)}
      {visible < total && <Button disabled={busy} onClick={() => visible < candidates.length ? setVisible(candidates.length) : loadCandidates(activeQuery, page + 1)}>
        {en ? 'Show more candidates' : 'Weitere Kandidaten anzeigen'}
      </Button>}
    </Box>}
    <Dialog open={Boolean(historyDetail)} onClose={() => setHistoryDetail(null)} fullWidth maxWidth="sm">
      <DialogTitle>{en ? 'Historical purchase' : 'Historischer Einkauf'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1 }}>
        <Typography>{historyDetail?.supplierName}</Typography>
        <Typography variant="body2">{historyDetail?.positionId} · {historyDetail?.orderDate ? new Date(historyDetail.orderDate).toLocaleDateString(en ? 'en-GB' : 'de-DE') : ''}</Typography>
        <Typography sx={{ fontWeight: 600 }}>{historyDetail?.articleName}</Typography>
        <Typography variant="body2">{en ? 'Our article index' : 'Unser Artikelindex'}: {historyDetail?.articleIndex}</Typography>
        <Typography variant="body2">MFI: {historyDetail?.measuredMfi ?? historyDetail?.mfi ?? '–'} {historyDetail?.mfiMethod || ''}</Typography>
        <Typography variant="body2">{historyDetail?.amount == null ? '' : Number(historyDetail.amount).toLocaleString(en ? 'en-GB' : 'de-DE')} {historyDetail?.unit}</Typography>
        <Typography variant="body2">{historyDetail?.goodsReceived ? (en ? 'Goods receipt recorded' : 'Wareneingang vermerkt') : (en ? 'No confirmed goods receipt' : 'Kein bestätigter Wareneingang')}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{historyDetail?.additionalText}</Typography>
      </DialogContent>
      <DialogActions><Button onClick={() => setHistoryDetail(null)}>{en ? 'Close' : 'Schließen'}</Button></DialogActions>
    </Dialog>
  </Box>;
}

import React from 'react';
import { Box, Typography } from '@mui/material';
import { optionDate, optionNumber, optionPrice, optionQuantity } from '../utils/optionDisplay.js';

export default function OptionVlRow({ item, onOpen, showSource, t, lang }) {
  const p = item.option;
  const en = lang === 'en';
  return <Box role="button" tabIndex={0} onClick={() => onOpen(item)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item); } }}
    sx={{ bgcolor: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 0.5, px: 1, py: 0.7,
      cursor: 'pointer', overflowWrap: 'anywhere', '&:hover': { bgcolor: '#DCEDC8' },
      '&:focus-visible': { outline: '2px solid #2E7D32' } }}>
    <Typography variant="caption" sx={{ display: 'block', color: '#23752A', fontWeight: 800 }}>
      {en ? 'Option' : 'Option'}{showSource ? ` · ${item.sourceMandantName}` : ''}{p.isDemo ? ' · Demo' : ''}
    </Typography>
    <Typography variant="body2">
      {item.article}{p.mfi != null ? ` · MFI ${optionNumber(p.mfi)}${p.mfiTestCondition ? ` (${p.mfiTestCondition})` : ''}` : ` · ${en ? 'MFI unknown' : 'MFI unbekannt'}`}
    </Typography>
    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      {[optionQuantity(p, t), optionPrice(p, t), p.supplierName,
        [p.incoterm, p.loadingLocation].filter(Boolean).join(' '),
        p.validUntil ? `${en ? 'Valid until' : 'Gültig bis'} ${optionDate(p.validUntil)}` : null].filter(Boolean).join(' · ')}
    </Typography>
    {p.expired && <Typography variant="caption" sx={{ display: 'block', color: 'error.dark', fontWeight: 600 }}>
      {en ? 'Expired – for information only' : 'Abgelaufen – nur zur Information'}
    </Typography>}
    {['pending', 'updating'].includes(p.matchProcessingStatus) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      {en ? 'Article suggestions are being prepared' : 'Artikelvorschläge werden vorbereitet'}
    </Typography>}
    {p.matchProcessingStatus === 'stale' && <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>
      {en ? 'Saved suggestions – background update overdue' : 'Gespeicherte Vorschläge – Aktualisierung ausstehend'}
    </Typography>}
    {!p.articleIndex && <Typography variant="caption" sx={{ display: 'block', color: '#23752A' }}>
      {p.suggestedArticleName ? `${en ? 'Suggested article' : 'Artikelvorschlag'}: ${p.suggestedArticleName}`
        : p.candidateCount > 1 ? (en ? 'Multiple possible articles – assignment open' : 'Mehrere Artikel möglich – Zuordnung offen')
          : (en ? 'Article assignment open' : 'Artikelzuordnung offen')}
    </Typography>}
  </Box>;
}

import React from 'react';
import { Box, Typography } from '@mui/material';
import { optionDate, optionPrice, optionQuantity, optionPackaging, optionPositionTitle, optionDeliveryTerm } from '../utils/optionDisplay.js';

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
      {optionPositionTitle({...p,articleName:p.articleName || item.article})}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('option_from')}: {p.supplierName}</Typography>
    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      {[optionQuantity(p, t), optionPrice(p, t),
        optionDeliveryTerm(p.incoterm, p.loadingLocation),
        p.validUntil ? `${en ? 'Valid until' : 'Gültig bis'} ${optionDate(p.validUntil)}` : null].filter(Boolean).join(' · ')}
    </Typography>
    {optionPackaging(p, lang) && <Typography variant="caption" sx={{display:'block',color:'text.secondary'}}>{optionPackaging(p, lang)}</Typography>}
    {['pending', 'updating'].includes(p.matchProcessingStatus) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      {en ? 'Article suggestions are being prepared' : 'Artikelvorschläge werden vorbereitet'}
    </Typography>}
    {p.matchProcessingStatus === 'stale' && <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>
      {en ? 'Saved suggestions – background update overdue' : 'Gespeicherte Vorschläge – Aktualisierung ausstehend'}
    </Typography>}
    {p.singleCandidateName && <Typography variant="caption" sx={{display:'block',color:'text.secondary'}}>{p.singleCandidateName}</Typography>}
    {p.mfiTestCondition && <Typography variant="caption" sx={{display:'block',color:'text.secondary'}}>{en?'Test method':'Messmethode'}: {p.mfiTestCondition}</Typography>}
  </Box>;
}

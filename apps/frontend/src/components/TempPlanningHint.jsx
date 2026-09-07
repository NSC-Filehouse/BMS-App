import React from 'react';
import { Box, Typography } from '@mui/material';

function formatQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return num.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

export default function TempPlanningHint({ item, onEmployeeClick, t }) {
  const plannedBy = Array.isArray(item?.tempPlannedBy)
    ? item.tempPlannedBy.filter((owner) => String(owner?.shortCode || '').trim())
    : [];
  if (!plannedBy.length) return null;

  const openEmployee = (shortCode) => {
    const code = String(shortCode || '').trim();
    if (code) onEmployeeClick(code);
  };

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        openEmployee(plannedBy[0].shortCode);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          openEmployee(plannedBy[0].shortCode);
        }
      }}
      sx={{
        mt: 0.25,
        px: 0.55,
        py: 0.2,
        borderRadius: 0.35,
        bgcolor: '#FFF3C4',
        color: '#8A5A00',
        cursor: 'pointer',
        lineHeight: 1.25,
        '&:hover': { bgcolor: '#FFE9A3' },
      }}
    >
      {plannedBy.map((owner) => (
        <Box
          key={owner.shortCode}
          component="span"
          sx={{ display: 'block', overflowWrap: 'anywhere' }}
          onClick={(event) => {
            event.stopPropagation();
            openEmployee(owner.shortCode);
          }}
        >
          <Typography component="span" variant="caption" sx={{ fontSize: '0.72rem', color: 'inherit' }}>
            {t('vl_temp_planned_hint', {
              amount: formatQuantity(owner.amountInKg),
              unit: item?.unit || 'kg',
              shortCode: owner.shortCode,
            })}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

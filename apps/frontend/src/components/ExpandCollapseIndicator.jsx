import React from 'react';
import { Box } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

export default function ExpandCollapseIndicator({
  expanded = false,
  direction = 'down',
  accordion = false,
}) {
  const Icon = direction === 'right' ? ChevronRightIcon : ExpandMoreIcon;
  const rotation = direction === 'right'
    ? (expanded ? 'rotate(90deg)' : 'rotate(0deg)')
    : (expanded ? 'rotate(180deg)' : 'rotate(0deg)');

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        minWidth: 30,
        color: 'text.secondary',
        lineHeight: 1,
        ...(accordion && {
          '.MuiAccordionSummary-expandIconWrapper.Mui-expanded &': {
            transform: 'rotate(-180deg)',
          },
        }),
      }}
    >
      <Icon
        fontSize="small"
        sx={{
          transform: rotation,
          transition: 'transform 160ms ease',
          ...(accordion && {
            '.MuiAccordionSummary-expandIconWrapper.Mui-expanded &': {
              transform: 'rotate(180deg)',
            },
          }),
        }}
      />
      {accordion ? (
        <>
          <Box
            component="span"
            sx={{
              fontSize: '0.5rem',
              color: 'text.secondary',
              lineHeight: 1,
              mt: -0.15,
              '.MuiAccordionSummary-expandIconWrapper.Mui-expanded &': { display: 'none' },
            }}
          >
            open
          </Box>
          <Box
            component="span"
            sx={{
              display: 'none',
              fontSize: '0.5rem',
              color: 'text.secondary',
              lineHeight: 1,
              mt: -0.15,
              '.MuiAccordionSummary-expandIconWrapper.Mui-expanded &': { display: 'inline' },
            }}
          >
            close
          </Box>
        </>
      ) : (
        <Box
          component="span"
          sx={{ fontSize: '0.5rem', color: 'text.secondary', lineHeight: 1, mt: -0.15 }}
        >
          {expanded ? 'close' : 'open'}
        </Box>
      )}
    </Box>
  );
}

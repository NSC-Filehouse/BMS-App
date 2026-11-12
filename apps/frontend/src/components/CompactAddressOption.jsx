import React from 'react';
import {Box,Typography} from '@mui/material';

export default function CompactAddressOption({primary,secondary}) {
  return <Box sx={{display:'grid',minWidth:0,width:'100%'}}>
    <Typography variant="body2" sx={{fontWeight:600,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{primary}</Typography>
    {secondary && <Typography variant="caption" sx={{color:'text.secondary',lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{secondary}</Typography>}
  </Box>;
}

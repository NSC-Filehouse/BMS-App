import React from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function DatabaseUnavailable() {
  const navigate = useNavigate();

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Card>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 1 }}>
            Datenbank nicht verfuegbar
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Diese DB ist noch nicht verfuegbar. Bitte waehle einen anderen Mandanten oder versuche es spaeter erneut.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/')}>
            Zur Startseite
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

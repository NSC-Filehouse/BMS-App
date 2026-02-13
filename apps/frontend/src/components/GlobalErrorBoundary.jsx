import React from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { APP_BASE_PATH } from '../config.js';

export default class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep details for debugging in browser devtools.
    console.error('Unhandled app error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
          <Card sx={{ maxWidth: 560, width: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Es ist ein unerwarteter Fehler aufgetreten.
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                Bitte lade die App neu. Wenn das Problem bleibt, gehe zur Startseite.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={() => window.location.reload()}>
                  Neu laden
                </Button>
                <Button variant="outlined" onClick={() => window.location.assign(`${APP_BASE_PATH}/`)}>
                  Zur Startseite
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}

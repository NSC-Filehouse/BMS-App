import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { setMandant, getMandant } from '../utils/mandant.js';

export default function Start() {
  const [mandants, setMandants] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const navigate = useNavigate();

  const selected = getMandant();

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest('/mandants');
        if (!alive) return;
        setMandants(res?.data || []);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Fehler beim Laden der Mandanten.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Mandant auswählen
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Bitte wähle den Mandanten, mit dem du arbeiten möchtest.
            </Typography>

            <List dense>
              {mandants.map((m) => (
                <ListItemButton
                  key={m}
                  selected={m === selected}
                  onClick={() => {
                    setMandant(m);
                    navigate('/customers');
                  }}
                >
                  <ListItemText primary={m} />
                </ListItemButton>
              ))}
            </List>

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                disabled={!selected}
                onClick={() => navigate('/customers')}
              >
                Weiter
              </Button>
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
              >
                Neu laden
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

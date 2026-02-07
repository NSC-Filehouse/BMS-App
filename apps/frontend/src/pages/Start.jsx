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
import { isAdminMandant, parseMandantFromEmail } from '../utils/user.js';

export default function Start() {
  const [mandants, setMandants] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [userMandant, setUserMandant] = React.useState('');
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [meName, setMeName] = React.useState({ given: '', surname: '' });
  const navigate = useNavigate();

  const selected = getMandant();

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError('');
        const [meRes, res] = await Promise.all([
          apiRequest('/me'),
          apiRequest('/mandants'),
        ]);
        if (!alive) return;

        const emailVal = meRes?.principalName || meRes?.mail || meRes?.email || '';
        const mandantFromEmail = parseMandantFromEmail(emailVal);
        const admin = isAdminMandant(mandantFromEmail);
        setEmail(emailVal);
        setMeName({
          given: meRes?.givenName || '',
          surname: meRes?.surname || '',
        });
        setUserMandant(mandantFromEmail);
        setIsAdmin(admin);
        setMandants(res?.data || []);

        if (!admin && mandantFromEmail) {
          const exists = (res?.data || []).includes(mandantFromEmail);
          if (exists) {
            setMandant(mandantFromEmail);
            navigate('/customers');
          } else {
            setError('Sie sind nicht berechtigt diese Funktionen zu nutzen.');
          }
        }
        if (!admin && !mandantFromEmail) {
          setError('Sie sind nicht berechtigt diese Funktionen zu nutzen.');
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.message || 'Fehler beim Laden der Mandanten.');
        setMeName({ given: '', surname: '' });
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

      {!loading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1">
            Benutzer: <b>{`${meName.given || ''} ${meName.surname || ''}`.trim() || '-'}</b>
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {email || '-'}
          </Typography>
        </Box>
      )}

      {error && isAdmin && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && error && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Keine Berechtigung
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {error}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Benutzer: <b>{`${meName.given || ''} ${meName.surname || ''}`.trim() || '-'}</b>
            </Typography>
            <Typography variant="body2">
              E-Mail: <b>{email || '-'}</b>
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading && !error && isAdmin && (
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

      {!loading && !error && !isAdmin && (
        <Card>
          <CardContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Eingeloggt als: <b>{email || '—'}</b>
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Mandant: <b>{userMandant || selected || '—'}</b>
            </Typography>
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


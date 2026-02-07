import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';

function getCustomerName(row) {
  const name1 = row?.kd_Name1 ? String(row.kd_Name1).trim() : '';
  const name2 = row?.kd_Name2 ? String(row.kd_Name2).trim() : '';
  return name1 || name2 || '';
}

function isValidCustomerName(name) {
  const trimmed = String(name || '').trim();
  return trimmed.length >= 3;
}

export default function CustomersList() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState([]);
  const PAGE_SIZE = 7;
  const SEARCH_MIN = 3;
  const [meta, setMeta] = React.useState({ page: 1, pageSize: PAGE_SIZE, total: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [q, setQ] = React.useState('');
  const metaRef = React.useRef(meta);
  const qRef = React.useRef(q);
  const hasMountedRef = React.useRef(false);

  React.useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  React.useEffect(() => {
    qRef.current = q;
  }, [q]);

  const load = React.useCallback(async (opts = {}) => {
    const currentMeta = metaRef.current || {};
    const page = opts.page ?? currentMeta.page ?? 1;
    const pageSize = PAGE_SIZE;
    const qVal = opts.q ?? qRef.current ?? '';
    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/customers?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}&sort=kd_Name1&dir=ASC`);
      const rows = res?.data || [];
      const filtered = rows.filter((row) => isValidCustomerName(getCustomerName(row)));
      setItems(filtered);
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      setError(e?.message || 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load({ q: '' });
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const qVal = q.trim();
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        return;
      }
      if (qVal.length === 0 || qVal.length >= SEARCH_MIN) {
        load({ page: 1, q: qVal });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q, load]);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">
          Kunden
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            aria-label="zurueck"
            onClick={() => load({ page: Math.max((meta.page || 1) - 1, 1), q })}
            disabled={(meta.page || 1) <= 1}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 80, textAlign: 'center' }}>
            Seite {meta.page || 1}
          </Typography>
          <IconButton
            aria-label="weiter"
            onClick={() => load({ page: (meta.page || 1) + 1, q })}
            disabled={meta.total !== null && meta.total !== undefined
              ? (meta.page || 1) * (meta.pageSize || PAGE_SIZE) >= meta.total
              : false}
          >
            <ArrowForwardIcon />
          </IconButton>
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Kunden durchsuchen"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ opacity: 0.6 }} />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ flexGrow: 1 }} />
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && items.length === 0 && (
        <Typography sx={{ opacity: 0.7 }}>Keine Kunden</Typography>
      )}

      {!loading && !error && items.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((row) => {
            const id = row?.kd_KdNR;
            const name = getCustomerName(row);
            return (
              <Card
                key={id ?? name}
                sx={{
                  borderRadius: 2,
                  border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/customers/${encodeURIComponent(id)}`)}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                  <Typography variant="body1" sx={{ pr: 2 }}>
                    {name || String(id ?? '')}
                  </Typography>
                  <Box sx={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                    <ChevronRightIcon />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

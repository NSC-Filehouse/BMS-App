import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { RESOURCES } from '../config.js';

function buildColumns(items, pk) {
  if (!items || !items.length) return [pk];
  const keys = Object.keys(items[0] || {});
  const others = keys.filter(k => k !== pk).slice(0, 3);
  return [pk, ...others];
}

export default function ResourceList({ resourceKey }) {
  const resource = RESOURCES[resourceKey];
  const navigate = useNavigate();

  const [items, setItems] = React.useState([]);
  const [meta, setMeta] = React.useState({ page: 1, pageSize: 25, total: null });
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async (opts = {}) => {
    const page = opts.page ?? meta.page ?? 1;
    const pageSize = opts.pageSize ?? meta.pageSize ?? 25;
    const qVal = opts.q ?? q;

    try {
      setLoading(true);
      setError('');
      const res = await apiRequest(`/${resource.key}?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(qVal)}`);
      setItems(res?.data || []);
      setMeta(res?.meta || { page, pageSize, total: null });
    } catch (e) {
      setError(e?.message || 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }, [resource.key, meta.page, meta.pageSize, q]);

  React.useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.key]);

  const columns = buildColumns(items, resource.pk);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {resource.label}
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            label="Suche (q)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button variant="contained" onClick={() => load({ page: 1, q })}>
            Suchen
          </Button>
          <IconButton aria-label="refresh" onClick={() => load({ q })}>
            <RefreshIcon />
          </IconButton>

          <Box sx={{ flexGrow: 1 }} />

          <TextField
            size="small"
            label="Page"
            type="number"
            value={meta.page || 1}
            onChange={(e) => setMeta(m => ({ ...m, page: Math.max(parseInt(e.target.value || '1', 10) || 1, 1) }))}
            sx={{ width: 110 }}
          />
          <TextField
            size="small"
            label="PageSize"
            type="number"
            value={meta.pageSize || 25}
            onChange={(e) => setMeta(m => ({ ...m, pageSize: Math.min(Math.max(parseInt(e.target.value || '25', 10) || 25, 1), 500) }))}
            sx={{ width: 130 }}
          />
          <Button variant="outlined" onClick={() => load({ page: meta.page, pageSize: meta.pageSize, q })}>
            Laden
          </Button>
        </CardContent>
      </Card>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <Card>
          <CardContent sx={{ overflowX: 'auto' }}>
            <Typography variant="body2" sx={{ mb: 1, opacity: 0.8 }}>
              Count: {meta.count ?? items.length} • Total: {meta.total ?? '—'} • Page: {meta.page} • PageSize: {meta.pageSize}
            </Typography>

            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((c) => (
                    <TableCell key={c}><b>{c}</b></TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row, idx) => {
                  const id = row?.[resource.pk];
                  return (
                    <TableRow
                      key={id ?? idx}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/${resource.key}/${encodeURIComponent(id)}`)}
                    >
                      {columns.map((c) => (
                        <TableCell key={c}>
                          {row?.[c] !== undefined && row?.[c] !== null ? String(row[c]) : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

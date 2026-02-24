import React from 'react';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../utils/i18n.jsx';

const PAGE_SIZE = 100;

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatNumber(value, fractionDigits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('de-DE', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function buildGroupTitle(item, lang) {
  const unknown = lang === 'en' ? 'unknown' : 'unbekannt';
  const main = asText(item?.plastic) || unknown;
  const sub = asText(item?.plasticSubCategory) || unknown;
  return `${main}-${sub}`;
}

function buildLine(item) {
  const amount = formatNumber(item?.amount, 0);
  const unit = asText(item?.unit);
  const article = asText(item?.article);
  const mfiValue = item?.mfiMeasured ?? item?.mfi;
  const mfi = Number.isFinite(Number(mfiValue)) ? formatNumber(mfiValue, 2).replace(/,00$/, '') : '';
  const mfiMethod = asText(item?.mfiTestMethod);
  const price = Number.isFinite(Number(item?.acquisitionPrice))
    ? formatNumber(item.acquisitionPrice, 0)
    : asText(item?.acquisitionPrice);
  const warehouse = asText(item?.warehouse);
  const beNumber = asText(item?.beNumber);
  const remark = asText(item?.about);

  let line = `${amount} ${unit} ${article}`.trim();
  if (mfi) {
    line += ` MFI ${mfi}`;
    if (mfiMethod) line += ` (${mfiMethod})`;
  }
  if (price) line += ` zu ${price}`;
  if (warehouse) line += ` ex ${warehouse}`;
  if (beNumber) line += ` ${beNumber}`;
  if (remark) line += ` - ${remark}`;

  return line;
}

export default function VlList() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [items, setItems] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [initialLoaded, setInitialLoaded] = React.useState(false);

  const hasMore = items.length < total;
  const sentinelRef = React.useRef(null);
  const loadingRef = React.useRef(false);

  const loadNextPage = React.useCallback(async () => {
    if (loadingRef.current) return;
    if (initialLoaded && !hasMore) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');

    const nextPage = page + 1;
    try {
      const res = await apiRequest(`/products?page=${nextPage}&pageSize=${PAGE_SIZE}&sort=vl&dir=ASC`);
      const data = Array.isArray(res?.data) ? res.data : [];
      const nextTotal = Number(res?.meta?.total || 0);
      setItems((prev) => [...prev, ...data]);
      setPage(nextPage);
      setTotal(nextTotal);
      setInitialLoaded(true);
    } catch (e) {
      setError(e?.message || 'Fehler beim Laden.');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [hasMore, initialLoaded, page]);

  React.useEffect(() => {
    void loadNextPage();
  }, []);

  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      void loadNextPage();
    }, { rootMargin: '250px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadNextPage]);

  let lastGroup = '';

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', pb: 2 }}>
      <Typography variant="h5" sx={{ mb: 1.5 }}>VL</Typography>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {items.map((item) => {
          const group = buildGroupTitle(item, lang);
          const showHeader = group !== lastGroup;
          if (showHeader) lastGroup = group;

          return (
            <Box
              key={item.id}
              sx={{
                mb: 0.4,
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/products/${encodeURIComponent(item.id)}`)}
            >
              {showHeader && (
                <Typography variant="subtitle2" sx={{ mt: 1.2, mb: 0.35, fontWeight: 700 }}>
                  {group}
                </Typography>
              )}
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.35,
                }}
              >
                {buildLine(item)}
              </Typography>
            </Box>
          );
        })}
      </Box>

      <Box ref={sentinelRef} sx={{ height: 18 }} />

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <CircularProgress size={22} />
        </Box>
      )}
    </Box>
  );
}

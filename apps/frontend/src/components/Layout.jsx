import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Button,
  ButtonBase,
} from '@mui/material';

import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DescriptionIcon from '@mui/icons-material/Description';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';

import { apiRequest } from '../api/client.js';
import { API_BASE_URL, APP_BASE_PATH } from '../config.js';
import { getMandant, clearMandant } from '../utils/mandant.js';
import { CUSTOMER_SELECTION_CHANGED, clearSelectedCustomer, getSelectedCustomer } from '../utils/customerSelection.js';
import { getStoredLanguage, useI18n } from '../utils/i18n.jsx';

const drawerWidth = 260;

function redirectToStart() {
  if (typeof window === 'undefined') return;
  window.location.assign(`${APP_BASE_PATH}/`);
}

function NavItem({ to, label, icon, onClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const selected = location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <ListItemButton
      selected={selected}
      onClick={() => {
        navigate(to);
        onClick?.();
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} />
    </ListItemButton>
  );
}

export default function Layout() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [userName, setUserName] = React.useState('');
  const [canSwitchMandant, setCanSwitchMandant] = React.useState(false);
  const [reminderCustomersCount, setReminderCustomersCount] = React.useState(0);
  const [selectedCustomer, setSelectedCustomerState] = React.useState(() => getSelectedCustomer());
  const mandant = getMandant();
  const navigate = useNavigate();
  const { t } = useI18n();
  const hasSelectedCustomer = Boolean(selectedCustomer?.id);

  const toggleDrawer = () => setOpen(v => !v);
  const closeDrawer = () => setOpen(false);

  React.useEffect(() => {
    const syncCustomer = () => setSelectedCustomerState(getSelectedCustomer());
    window.addEventListener(CUSTOMER_SELECTION_CHANGED, syncCustomer);
    window.addEventListener('storage', syncCustomer);
    syncCustomer();
    return () => {
      window.removeEventListener(CUSTOMER_SELECTION_CHANGED, syncCustomer);
      window.removeEventListener('storage', syncCustomer);
    };
  }, [mandant]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const requests = [
          apiRequest('/me'),
          apiRequest('/mandants'),
          mandant ? apiRequest('/customers/reminders-summary') : Promise.resolve({ data: { count: 0 } }),
        ];
        const [res, mandantsRes, remindersRes] = await Promise.all(requests);
        if (!alive) return;
        const emailVal = res?.principalName || res?.mail || res?.email || '';
        setEmail(emailVal);
        const nameVal = `${res?.givenName || ''} ${res?.surname || ''}`.trim();
        setUserName(nameVal);
        const available = Array.isArray(mandantsRes?.data) ? mandantsRes.data : [];
        setCanSwitchMandant(available.length > 1);
        setReminderCustomersCount(Number(remindersRes?.data?.count) || 0);
      } catch {
        if (!alive) return;
        setEmail('');
        setUserName('');
        setCanSwitchMandant(false);
        setReminderCustomersCount(0);
      }
    })();
    return () => { alive = false; };
  }, [mandant]);

  React.useEffect(() => {
    let active = true;
    let inFlight = false;

    const probeSession = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const headers = new Headers();
        const lang = getStoredLanguage();
        if (lang) headers.set('x-lang', lang);

        const res = await fetch(`${API_BASE_URL}/me`, { headers, cache: 'no-store' });
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        const isJson = contentType.includes('application/json');

        if (!res.ok || res.redirected || !isJson) {
          redirectToStart();
          return;
        }

        const me = await res.json().catch(() => null);
        const identity = me?.principalName || me?.mail || me?.email;
        if (!identity) {
          redirectToStart();
        }
      } catch {
        redirectToStart();
      } finally {
        inFlight = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void probeSession();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const drawer = (
    <Box sx={{ width: drawerWidth }} role="presentation">
      <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <IconButton aria-label="close-menu" onClick={closeDrawer}>
          <CloseIcon />
        </IconButton>
      </Toolbar>
      <Divider />
      <List>
        <NavItem to="/vl" label={t('vl_title')} icon={<FormatListBulletedIcon />} onClick={closeDrawer} />
        <NavItem to="/timeline" label={t('timeline_title')} icon={<HistoryIcon />} onClick={closeDrawer} />
        <NavItem to="/customers" label={t('customers_title')} icon={<PeopleIcon />} onClick={closeDrawer} />
        {reminderCustomersCount > 0 && (
          <ListItemButton
            onClick={() => {
              navigate('/customers', {
                state: {
                  listState: {
                    page: 1,
                    q: '',
                    searchField: 'name',
                    reminderOnly: true,
                  },
                },
              });
              closeDrawer();
            }}
          >
            <ListItemIcon>
              <PeopleIcon color="error" />
            </ListItemIcon>
            <ListItemText
              primary={`${t('customers_reminders_title')} (${reminderCustomersCount})`}
              primaryTypographyProps={{ sx: { color: 'error.main', fontWeight: 700 } }}
            />
          </ListItemButton>
        )}
        <NavItem to="/temp-orders" label={t('temp_orders_title')} icon={<DescriptionIcon />} onClick={closeDrawer} />
        <NavItem to="/orders" label={t('orders_title')} icon={<AssignmentIcon />} onClick={closeDrawer} />
        <NavItem to="/products" label={t('products_title')} icon={<Inventory2Icon />} onClick={closeDrawer} />
      </List>
      <Divider />
      <List>
        <NavItem to="/settings" label={t('settings_title')} icon={<SettingsIcon />} onClick={closeDrawer} />
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t('mandant_label')}: <b>{mandant || '-'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t('order_customer')}: <b>{selectedCustomer?.name || selectedCustomer?.id || '-'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {t('start_user')}: <b>{userName || '-'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t('start_email')}: <b>{email || '-'}</b>
        </Typography>
        {canSwitchMandant && (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => {
              clearSelectedCustomer();
              clearMandant();
              navigate('/');
              closeDrawer();
            }}
          >
            {t('switch_mandant')}
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed">
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={toggleDrawer}
            sx={{ mr: 2 }}
            aria-label="menu"
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src="https://mlcdn-e5aygudafwh4e7gs.z02.azurefd.net/bmsapp/icon.svg"
            alt="BMS"
            sx={{ width: 48, height: 48, mr: 1 }}
          />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>

          </Typography>
          <Box sx={{ textAlign: 'right', minWidth: 0 }}>
            <Typography variant="body2" sx={{ opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mandant ? `${t('mandant_label')}: ${mandant}` : t('mandant_none')}
            </Typography>
            <ButtonBase
              disabled={!mandant}
              onClick={() => navigate('/customers')}
              aria-label={hasSelectedCustomer
                ? `${t('order_customer')}: ${selectedCustomer?.name || selectedCustomer?.id}`
                : t('customer_not_selected')}
              sx={{
                display: 'flex',
                ml: 'auto',
                mt: 0.25,
                minHeight: 30,
                maxWidth: { xs: 170, sm: 360 },
                px: 0.75,
                borderRadius: 1,
                color: hasSelectedCustomer ? 'inherit' : '#4a2a00',
                bgcolor: hasSelectedCustomer ? 'transparent' : 'warning.light',
                border: hasSelectedCustomer ? '1px solid transparent' : '1px solid rgba(255,255,255,0.8)',
                '&:hover': {
                  bgcolor: hasSelectedCustomer ? 'rgba(255,255,255,0.12)' : 'warning.main',
                },
                '&.Mui-focusVisible': {
                  outline: '2px solid white',
                  outlineOffset: 2,
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  width: '100%',
                  fontWeight: hasSelectedCustomer ? 400 : 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {hasSelectedCustomer
                  ? `${t('order_customer')}: ${selectedCustomer?.name || selectedCustomer?.id}`
                  : t('customer_not_selected')}
              </Typography>
            </ButtonBase>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        open={open}
        onClose={closeDrawer}
        ModalProps={{ keepMounted: true }}
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 2, pt: 10 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

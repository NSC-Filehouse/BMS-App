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
} from '@mui/material';

import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HomeIcon from '@mui/icons-material/Home';

import { apiRequest } from '../api/client.js';
import { getMandant, clearMandant } from '../utils/mandant.js';
import { getEffectiveMandant, isAdminFromEmail } from '../utils/user.js';
import { useI18n } from '../utils/i18n.jsx';

const drawerWidth = 260;

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
  const [isAdmin, setIsAdmin] = React.useState(false);
  const mandant = getMandant();
  const navigate = useNavigate();
  const { lang, setLang, t } = useI18n();

  const toggleDrawer = () => setOpen(v => !v);
  const closeDrawer = () => setOpen(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiRequest('/me');
        if (!alive) return;
        const emailVal = res?.principalName || res?.mail || res?.email || '';
        setEmail(emailVal);
        const nameVal = `${res?.givenName || ''} ${res?.surname || ''}`.trim();
        setUserName(nameVal);
        const m = getEffectiveMandant(emailVal);
        setIsAdmin(isAdminFromEmail(emailVal));
      } catch {
        if (!alive) return;
        setEmail('');
        setUserName('');
        setIsAdmin(false);
      }
    })();
    return () => { alive = false; };
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
        <NavItem to="/" label={t('start_title')} icon={<HomeIcon />} onClick={closeDrawer} />
        <NavItem to="/customers" label={t('customers_title')} icon={<PeopleIcon />} onClick={closeDrawer} />
        <NavItem to="/products" label={t('products_title')} icon={<Inventory2Icon />} onClick={closeDrawer} />
        <NavItem to="/orders" label={t('orders_title')} icon={<AssignmentIcon />} onClick={closeDrawer} />
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t('mandant_label')}: <b>{mandant || '-'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          {t('start_user')}: <b>{userName || '-'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t('start_email')}: <b>{email || '-'}</b>
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <IconButton size="small" aria-label="de" onClick={() => setLang('de')} sx={{ border: lang === 'de' ? '1px solid rgba(0,0,0,0.3)' : '1px solid transparent' }}><Box component="img" src={`${import.meta.env.BASE_URL}flags/de.png`} alt="DE" sx={{ width: 24, height: 24 }} /></IconButton>
          <IconButton size="small" aria-label="en" onClick={() => setLang('en')} sx={{ border: lang === 'en' ? '1px solid rgba(0,0,0,0.3)' : '1px solid transparent' }}><Box component="img" src={`${import.meta.env.BASE_URL}flags/en.png`} alt="EN" sx={{ width: 24, height: 24 }} /></IconButton>
        </Box>
        {isAdmin && (
          <Button
            variant="outlined"
            fullWidth
            onClick={() => {
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
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt="BMS"
            sx={{ width: 24, height: 24, mr: 1 }}
          />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {t('app_title')}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {mandant ? `${t('mandant_label')}: ${mandant}` : t('mandant_none')}
          </Typography>
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

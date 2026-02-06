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
import PeopleIcon from '@mui/icons-material/People';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HomeIcon from '@mui/icons-material/Home';

import { apiRequest } from '../api/client.js';
import { getMandant, clearMandant } from '../utils/mandant.js';

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
  const mandant = getMandant();
  const navigate = useNavigate();

  const toggleDrawer = () => setOpen(v => !v);
  const closeDrawer = () => setOpen(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiRequest('/me');
        if (!alive) return;
        setEmail(res?.email || '');
      } catch {
        if (!alive) return;
        setEmail('');
      }
    })();
    return () => { alive = false; };
  }, []);

  const drawer = (
    <Box sx={{ width: drawerWidth }} role="presentation">
      <Toolbar />
      <Divider />
      <List>
        <NavItem to="/" label="Start" icon={<HomeIcon />} onClick={closeDrawer} />
        <NavItem to="/customers" label="Kunden" icon={<PeopleIcon />} onClick={closeDrawer} />
        <NavItem to="/products" label="Produkte" icon={<Inventory2Icon />} onClick={closeDrawer} />
        <NavItem to="/orders" label="Aufträge" icon={<AssignmentIcon />} onClick={closeDrawer} />
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Mandant: <b>{mandant || '—'}</b>
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Eingeloggt als: <b>{email || '—'}</b>
        </Typography>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => {
            clearMandant();
            navigate('/');
            closeDrawer();
          }}
        >
          Mandant wechseln
        </Button>
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
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            BMS-App
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            {mandant ? `Mandant: ${mandant}` : 'Kein Mandant gewählt'}
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


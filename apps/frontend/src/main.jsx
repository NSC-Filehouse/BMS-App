import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App.jsx';
import { APP_BASE_PATH } from './config.js';

const theme = createTheme({
  palette: {
    primary: { main: '#5788C2' },
    secondary: { main: '#00ADEF' },
    background: { default: '#f5f5f5' }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter basename={APP_BASE_PATH}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

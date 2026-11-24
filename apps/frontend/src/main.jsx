import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App.jsx';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import { APP_BASE_PATH } from './config.js';

const fieldValueFontSize = '13px';
const filterLabelFontSize = '12px';

const theme = createTheme({
  components: {
    MuiFormControlLabel: {
      styleOverrides: {
        root: {
          '.filter-radio-group & > .MuiFormControlLabel-label, &:has(> .MuiSwitch-root) > .MuiFormControlLabel-label': {
            fontSize: filterLabelFontSize
          }
        }
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { fontSize: filterLabelFontSize }
      }
    },
    MuiInputBase: {
      styleOverrides: {
        input: { '&:is(input, textarea)': { fontSize: fieldValueFontSize } }
      }
    },
    MuiSelect: {
      styleOverrides: {
        select: { '&:not(.address-select)': { fontSize: fieldValueFontSize } }
      }
    },
    MuiMenu: {
      styleOverrides: {
        list: {
          '&[role="listbox"]:not(.address-select-list) > .MuiMenuItem-root': {
            fontSize: fieldValueFontSize
          }
        }
      }
    },
    MuiAutocomplete: {
      styleOverrides: {
        inputRoot: { fontSize: fieldValueFontSize },
        listbox: { fontSize: fieldValueFontSize }
      }
    }
  },
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
      <BrowserRouter basename={APP_BASE_PATH} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GlobalErrorBoundary>
          <App />
        </GlobalErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

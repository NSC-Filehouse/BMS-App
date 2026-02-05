import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import App from './App.jsx';
import { APP_BASE_PATH } from './config.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CssBaseline />
    <BrowserRouter basename={APP_BASE_PATH}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

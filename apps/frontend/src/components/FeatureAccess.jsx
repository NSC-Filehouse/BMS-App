import React from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { apiRequest } from '../api/client.js';

const noFeatures = { offers: false, offerToOrder: false, purchaseOrders: false, options: false, forecast: false };
const FeatureContext = React.createContext({ loading: true, features: noFeatures });

export function FeatureProvider({ children }) {
  const [state, setState] = React.useState({
    loading: true,
    features: noFeatures,
  });

  React.useEffect(() => {
    let active = true;
    apiRequest('/me')
      .then((me) => {
        if (active) setState({ loading: false, features: {
          offers: Boolean(me?.identityResolved && me?.features?.offers),
          offerToOrder: Boolean(me?.identityResolved && me?.features?.offerToOrder),
          purchaseOrders: Boolean(me?.identityResolved && me?.features?.purchaseOrders),
          options: Boolean(me?.identityResolved && me?.features?.options),
          forecast: Boolean(me?.identityResolved && me?.features?.forecast),
        } });
      })
      .catch(() => {
        if (active) setState({ loading: false, features: noFeatures });
      });
    return () => { active = false; };
  }, []);

  return <FeatureContext.Provider value={state}>{children}</FeatureContext.Provider>;
}

export function useFeatureAccess() {
  return React.useContext(FeatureContext);
}

export function FeatureGuard({ feature, children }) {
  const { loading, features } = useFeatureAccess();
  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (!features[feature]) return <Navigate to="/customers" replace />;
  return children;
}

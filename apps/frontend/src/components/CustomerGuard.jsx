import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getSelectedCustomer } from '../utils/customerSelection.js';

export default function CustomerGuard({ children }) {
  const selectedCustomer = getSelectedCustomer();
  const location = useLocation();

  if (!selectedCustomer?.id) {
    return (
      <Navigate
        to="/customers"
        replace
        state={{
          afterSelect: {
            to: location.pathname,
            state: location.state || null,
          },
        }}
      />
    );
  }

  return children;
}

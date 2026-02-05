import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getMandant } from '../utils/mandant.js';

export default function MandantGuard({ children }) {
  const mandant = getMandant();
  const location = useLocation();

  if (!mandant) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}

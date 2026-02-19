import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import { LanguageProvider } from './utils/i18n.jsx';
import MandantGuard from './components/MandantGuard.jsx';

import Start from './pages/Start.jsx';

import CustomersList from './pages/CustomersList.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';

import ProductsList from './pages/ProductsList.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import ProductWpzDetail from './pages/ProductWpzDetail.jsx';
import OrderCart from './pages/OrderCart.jsx';

import OrdersList from './pages/OrdersList.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import OrderCreate from './pages/OrderCreate.jsx';
import TempOrdersList from './pages/TempOrdersList.jsx';
import TempOrderDetail from './pages/TempOrderDetail.jsx';
import TempOrderForm from './pages/TempOrderForm.jsx';
import DatabaseUnavailable from './pages/DatabaseUnavailable.jsx';

export default function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Start />} />
          <Route path="/database-unavailable" element={<DatabaseUnavailable />} />

        <Route
          path="/customers"
          element={
            <MandantGuard>
              <CustomersList />
            </MandantGuard>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <MandantGuard>
              <CustomerDetail />
            </MandantGuard>
          }
        />

        <Route
          path="/products"
          element={
            <MandantGuard>
              <ProductsList />
            </MandantGuard>
          }
        />
        <Route
          path="/products/:id"
          element={
            <MandantGuard>
              <ProductDetail />
            </MandantGuard>
          }
        />
        <Route
          path="/products/:id/wpz"
          element={
            <MandantGuard>
              <ProductWpzDetail />
            </MandantGuard>
          }
        />
        <Route
          path="/order-cart"
          element={
            <MandantGuard>
              <OrderCart />
            </MandantGuard>
          }
        />

        <Route
          path="/orders"
          element={
            <MandantGuard>
              <OrdersList />
            </MandantGuard>
          }
        />
        <Route
          path="/orders/new"
          element={
            <MandantGuard>
              <OrderCreate />
            </MandantGuard>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <MandantGuard>
              <OrderDetail />
            </MandantGuard>
          }
        />

        <Route
          path="/temp-orders"
          element={
            <MandantGuard>
              <TempOrdersList />
            </MandantGuard>
          }
        />
        <Route
          path="/temp-orders/new"
          element={
            <MandantGuard>
              <TempOrderForm />
            </MandantGuard>
          }
        />
        <Route
          path="/temp-orders/:id"
          element={
            <MandantGuard>
              <TempOrderDetail />
            </MandantGuard>
          }
        />
        <Route
          path="/temp-orders/:id/edit"
          element={
            <MandantGuard>
              <TempOrderForm />
            </MandantGuard>
          }
        />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LanguageProvider>
  );
}

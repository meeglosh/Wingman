import React from 'react';
import { Outlet } from 'react-router';
import { PresentationProvider } from '../context/PresentationContext';

export default function RootLayout() {
  return (
    <PresentationProvider>
      <Outlet />
    </PresentationProvider>
  );
}

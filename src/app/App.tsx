import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { PresentationProvider } from './context/PresentationContext';

export default function App() {
  return (
    <PresentationProvider>
      <RouterProvider router={router} />
    </PresentationProvider>
  );
}

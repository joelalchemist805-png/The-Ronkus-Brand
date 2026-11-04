import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';
import './commerce.css';

const AdminApp = lazy(() => import('./admin/admin-app'));
const isAdminRoute = /^\/admin(?:\/|$)/.test(window.location.pathname);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    {isAdminRoute
      ? <Suspense fallback={<div role="status">Loading admin…</div>}><AdminApp /></Suspense>
      : <App />}
  </ErrorBoundary>,
);

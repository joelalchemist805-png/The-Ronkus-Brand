import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { AdminAuthProvider, useAdminAuth } from './admin-auth';
import { AdminButton, AdminCard, AdminInput, LoadingState } from './admin-components';
import './admin.css';

const CategoriesPage = lazy(() => import('./catalog-pages').then((module) => ({ default: module.CategoriesPage })));
const DeliveryPage = lazy(() => import('./catalog-pages').then((module) => ({ default: module.DeliveryPage })));
const ProductsPage = lazy(() => import('./product-pages').then((module) => ({ default: module.ProductsPage })));
const ProductFormPage = lazy(() => import('./product-pages').then((module) => ({ default: module.ProductFormPage })));
const CouponsPage = lazy(() => import('./coupon-pages').then((module) => ({ default: module.CouponsPage })));
const SettingsPage = lazy(() => import('./coupon-pages').then((module) => ({ default: module.SettingsPage })));

const navigation = [
  { path: '/admin', label: 'Home', soon: false },
  { path: '/admin/categories', label: 'Categories', soon: false },
  { path: '/admin/delivery', label: 'Delivery', soon: false },
  { path: '/admin/coupons', label: 'Coupons', soon: false },
  { path: '/admin/settings', label: 'Settings', soon: false },
  { path: '/admin/products', label: 'Products', soon: false },
  { path: '/admin/featured', label: 'Featured', soon: true },
  { path: '/admin/orders', label: 'Orders', soon: true },
  { path: '/admin/promotions', label: 'Promotions', soon: true },
] as const;

const failedAttemptsStorageKey = 'ronkus-admin-failed-attempts';
const lockoutStorageKey = 'ronkus-admin-lock-until';

function normalizeAdminPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function useAdminPath() {
  const [path, setPath] = useState(() => normalizeAdminPath(window.location.pathname));
  const pathRef = useRef(path);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const navigateTo = useCallback((pathname: string) => {
    const nextPath = normalizeAdminPath(pathname);
    if (nextPath === pathRef.current) return;
    if (dirtyRef.current && !window.confirm('You have unsaved changes. Leave this page and discard them?')) return;
    window.history.pushState(null, '', nextPath);
    pathRef.current = nextPath;
    setPath(nextPath);
  }, []);

  useEffect(() => {
    if (window.location.pathname !== path) {
      window.history.replaceState(
        null,
        '',
        `${path}${window.location.search}${window.location.hash}`,
      );
    }
    const updatePath = () => {
      const nextPath = normalizeAdminPath(window.location.pathname);
      if (dirtyRef.current && nextPath !== pathRef.current
        && !window.confirm('You have unsaved changes. Leave this page and discard them?')) {
        window.history.pushState(null, '', pathRef.current);
        return;
      }
      if (window.location.pathname !== nextPath) {
        window.history.replaceState(
          null,
          '',
          `${nextPath}${window.location.search}${window.location.hash}`,
        );
      }
      pathRef.current = nextPath;
      setPath(nextPath);
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('popstate', updatePath);
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => {
      window.removeEventListener('popstate', updatePath);
      window.removeEventListener('beforeunload', warnBeforeUnload);
    };
  }, []);

  const navigate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    const anchor = event.currentTarget;
    if (anchor.origin !== window.location.origin) return;
    event.preventDefault();
    navigateTo(anchor.pathname);
  };

  return { path, navigate, navigateTo, setDirty };
}

function LoginScreen() {
  const { signIn, message, clearMessage, checking } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(() => Number(sessionStorage.getItem(failedAttemptsStorageKey)) || 0);
  const [lockUntil, setLockUntil] = useState(() => Number(sessionStorage.getItem(lockoutStorageKey)) || 0);
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    const storedLockUntil = Number(sessionStorage.getItem(lockoutStorageKey)) || 0;
    return Math.max(0, Math.ceil((storedLockUntil - Date.now()) / 1000));
  });
  const [credentialsMessage, setCredentialsMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!lockUntil) return;
    const updateRemaining = () => {
      const seconds = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setSecondsRemaining(seconds);
      if (seconds === 0) {
        sessionStorage.removeItem(lockoutStorageKey);
        sessionStorage.removeItem(failedAttemptsStorageKey);
        setLockUntil(0);
        setFailedAttempts(0);
      }
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [lockUntil]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lockUntil > Date.now()) return;
    setBusy(true);
    setCredentialsMessage(null);
    clearMessage();
    try {
      const result = await signIn(email.trim(), password);
      if (result === 'credentials') {
        const attempts = failedAttempts + 1;
        sessionStorage.setItem(failedAttemptsStorageKey, String(attempts));
        if (attempts >= 5) {
          setFailedAttempts(attempts);
          const nextLockUntil = Date.now() + 60_000;
          sessionStorage.setItem(lockoutStorageKey, String(nextLockUntil));
          setLockUntil(nextLockUntil);
          setCredentialsMessage('Too many failed attempts. Try again in 60 seconds.');
        } else {
          setFailedAttempts(attempts);
          setCredentialsMessage('Email or password is incorrect.');
        }
      } else if (result === 'success') {
        setFailedAttempts(0);
        sessionStorage.removeItem(failedAttemptsStorageKey);
        sessionStorage.removeItem(lockoutStorageKey);
        setLockUntil(0);
        setSecondsRemaining(0);
        setCredentialsMessage(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const locked = secondsRemaining > 0;
  return (
    <main className="admin-login-wrap">
      <section className="admin-login" aria-labelledby="admin-login-title">
        <p className="admin-eyebrow">The Ronkus Brand</p>
        <h1 id="admin-login-title">Admin sign in</h1>
        <p>Sign in with your existing administrator account.</p>
        {(credentialsMessage || message) && (
          <div className="admin-alert" role="alert">{credentialsMessage ?? message}</div>
        )}
        {checking && <LoadingState label="Checking your administrator access…" />}
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <AdminInput
            id="admin-email"
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(value) => {
              setEmail(value);
              setCredentialsMessage(null);
            }}
            required
            disabled={busy || checking || locked}
          />
          <AdminInput
            id="admin-password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setCredentialsMessage(null);
            }}
            required
            disabled={busy || checking || locked}
          />
          {locked && <p className="admin-field-error" role="status">Sign-in is locked for {secondsRemaining} seconds.</p>}
          <AdminButton type="submit" disabled={busy || checking || locked}>
            {busy ? 'Signing in…' : 'Sign in'}
          </AdminButton>
        </form>
      </section>
    </main>
  );
}

function AdminLink({ path, currentPath, children, onNavigate, className = '' }: {
  path: string;
  currentPath: string;
  children: ReactNode;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}) {
  const active = path === currentPath || (path !== '/admin' && currentPath.startsWith(`${path}/`));
  return (
    <a
      href={path}
      onClick={onNavigate}
      className={`admin-nav-link ${active ? 'is-current' : ''} ${className}`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </a>
  );
}

function Dashboard({ path, onNavigate }: {
  path: string;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>Admin home</h1>
          <p>Manage your storefront settings and catalog structure.</p>
        </div>
      </header>
      <div className="admin-dashboard-grid">
        {navigation.filter((item) => item.path !== '/admin').map((item) => (
          <AdminLink key={item.path} path={item.path} currentPath={path} onNavigate={onNavigate} className="admin-dashboard-link">
            <strong>{item.label}</strong>
            <span>{item.soon ? 'Coming soon' : 'Manage'}</span>
          </AdminLink>
        ))}
      </div>
    </div>
  );
}

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <h1>{title}</h1>
          <p>This section is planned for a future release.</p>
        </div>
      </header>
      <AdminCard className="admin-coming-soon">
        <span className="admin-status">Coming soon</span>
        <p>{title} management is not available yet.</p>
      </AdminCard>
    </div>
  );
}

function getComingSoonTitle(path: string): string | null {
  const item = navigation.find((entry) => entry.path === path && entry.soon);
  return item?.label ?? null;
}

function AdminShell() {
  const { path, navigate, navigateTo, setDirty } = useAdminPath();
  const { signOut, checking } = useAdminAuth();
  const pageTitle = getComingSoonTitle(path);
  const productEditMatch = /^\/admin\/products\/([^/]+)$/.exec(path);

  if (checking) {
    return <main className="admin-loading-screen"><LoadingState label="Checking your administrator access…" /></main>;
  }

  const currentPage = path === '/admin'
    ? <Dashboard path={path} onNavigate={navigate} />
    : path === '/admin/categories'
      ? <CategoriesPage />
      : path === '/admin/delivery'
        ? <DeliveryPage />
        : path === '/admin/coupons'
          ? <CouponsPage />
          : path === '/admin/settings'
            ? <SettingsPage />
            : path === '/admin/products'
              ? <ProductsPage onNavigate={navigate} />
              : path === '/admin/products/new'
                ? <ProductFormPage onNavigate={navigate} onNavigateTo={navigateTo} onDirtyChange={setDirty} />
                : productEditMatch
                  ? <ProductFormPage id={productEditMatch[1]} onNavigate={navigate} onNavigateTo={navigateTo} onDirtyChange={setDirty} />
            : pageTitle
              ? <ComingSoonPage title={pageTitle} />
              : <ComingSoonPage title="Admin page" />;

  return (
    <div className="admin-root">
      <header className="admin-topbar">
        <a className="admin-brand" href="/admin" onClick={navigate}>
          <span className="admin-brand-mark" aria-hidden="true">R</span>
          <span>The Ronkus Brand <small>Admin</small></span>
        </a>
        <AdminButton
          type="button"
          variant="secondary"
          onClick={() => {
            void signOut().catch((error: unknown) => toast.error(
              error instanceof Error ? error.message : 'Could not sign out. Please try again.',
            ));
          }}
        >
          Sign out
        </AdminButton>
      </header>
      <div className="admin-shell">
        <aside className="admin-sidebar" aria-label="Admin sidebar">
          <nav aria-label="Admin navigation">
            {navigation.map((item) => (
              <AdminLink key={item.path} path={item.path} currentPath={path} onNavigate={navigate}>
                <span>{item.label}</span>
                {item.soon && <small>Coming soon</small>}
              </AdminLink>
            ))}
          </nav>
        </aside>
        <main className="admin-main" id="admin-main">
          <Suspense fallback={<LoadingState />}>{currentPage}</Suspense>
        </main>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}

function AdminContent() {
  const { isAdmin, checking, initialized } = useAdminAuth();
  if (!initialized || (isAdmin && checking)) {
    return <main className="admin-loading-screen"><LoadingState label="Checking your administrator access…" /></main>;
  }
  return isAdmin ? <AdminShell /> : <LoginScreen />;
}

export default function AdminApp() {
  useEffect(() => {
    document.title = 'Admin | The Ronkus Brand';
    const selector = 'meta[name="robots"]';
    const existing = document.head.querySelector<HTMLMetaElement>(selector);
    const previousContent = existing?.content;
    const robots = existing ?? document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow';
    if (!existing) document.head.append(robots);
    return () => {
      if (existing && previousContent !== undefined) {
        existing.content = previousContent;
      } else {
        robots.remove();
      }
    };
  }, []);

  return (
    <AdminAuthProvider>
      <AdminContent />
    </AdminAuthProvider>
  );
}

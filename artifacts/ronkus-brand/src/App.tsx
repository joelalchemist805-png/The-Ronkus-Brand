import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { ShopProvider } from '@/components/shop-provider';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Homepage from '@/components/homepage';
import { SiteLayout } from '@/components/site-layout';
import { FaqPage } from '@/pages/faq-page';
import { AcademyPage } from '@/pages/academy-page';
import ContactPage from '@/pages/contact-page';
import { academyData } from '@/data/academy';
import {
  CategoryPage,
  ShopOverviewPage,
  isKnownCategoryRoute,
} from '@/pages/shop-pages';
import NotFound from '@/pages/not-found';
import { findCategoryBySlug, findSubcategoryBySlug } from '@/lib/catalog';
import {
  Route,
  Switch,
  useRoute,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function VisualViewportMetrics() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    const updateMetrics = () => {
      const width = viewport?.width || root.clientWidth || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;

      root.style.setProperty('--visible-viewport-width', `${width}px`);
      root.style.setProperty('--visible-viewport-height', `${height}px`);
      root.style.setProperty('--visible-viewport-center-x', `${left + width / 2}px`);
      root.style.setProperty('--visible-viewport-center-y', `${top + height / 2}px`);
    };

    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    viewport?.addEventListener('resize', updateMetrics);
    viewport?.addEventListener('scroll', updateMetrics);

    return () => {
      window.removeEventListener('resize', updateMetrics);
      viewport?.removeEventListener('resize', updateMetrics);
      viewport?.removeEventListener('scroll', updateMetrics);
      root.style.removeProperty('--visible-viewport-width');
      root.style.removeProperty('--visible-viewport-height');
      root.style.removeProperty('--visible-viewport-center-x');
      root.style.removeProperty('--visible-viewport-center-y');
    };
  }, []);

  return null;
}

function Home() {
  return <Homepage />;
}

function CategoryRoute() {
  const [matches, params] = useRoute('/shop/:category/:subcategory');
  if (!matches || !params) return null;
  if (!isKnownCategoryRoute(params.category, params.subcategory)) return <NotFound />;
  return <CategoryPage categorySlug={params.category} subcategorySlug={params.subcategory} />;
}

function CategoryRootRoute() {
  const [matches, params] = useRoute('/shop/:category');
  if (!matches || !params) return null;
  if (!isKnownCategoryRoute(params.category)) return <NotFound />;
  return <CategoryPage categorySlug={params.category} />;
}

function getPageTitle(location: string): string {
  const segments = location.split('/').filter(Boolean);
  if (segments.length === 0) return 'Home | The Ronkus Brand';
  if (segments[0] === 'shop' && segments.length === 1) return 'Shop | The Ronkus Brand';
  if (segments[0] === 'shop' && segments.length <= 3 && segments[1]) {
    const category = findCategoryBySlug(segments[1]);
    if (!category) return 'Page Not Found | The Ronkus Brand';
    if (segments[2]) {
      const subcategory = findSubcategoryBySlug(category, segments[2]);
      return subcategory
        ? `${subcategory} | The Ronkus Brand`
        : 'Page Not Found | The Ronkus Brand';
    }
    return `${category.name} | The Ronkus Brand`;
  }
  const pageTitles: Record<string, string> = {
    '/academy': academyData.title,
    '/faq': 'FAQ',
    '/contact': 'Contact & About Us',
  };
  const pageTitle = pageTitles[`/${segments.join('/')}`];
  return pageTitle
    ? `${pageTitle} | The Ronkus Brand`
    : 'Page Not Found | The Ronkus Brand';
}

function getPageDescription(location: string): string {
  const segments = location.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'Discover handcrafted footwear, expressive fashion, statement accessories and personalized pieces from The Ronkus Brand.';
  }
  if (segments[0] === 'shop' && segments.length <= 3) {
    if (segments.length === 1) {
      return 'Explore all handcrafted footwear, clothing, bags, hair accessories and lifestyle pieces from The Ronkus Brand.';
    }
    const category = findCategoryBySlug(segments[1]);
    if (!category) return 'The page you are looking for could not be found. Explore The Ronkus Brand shop or return home.';
    if (segments[2]) {
      const subcategory = findSubcategoryBySlug(category, segments[2]);
      return subcategory
        ? `Shop ${subcategory} from The Ronkus Brand, crafted to complete your outfit with comfort and style.`
        : 'The page you are looking for could not be found. Explore The Ronkus Brand shop or return home.';
    }
    return `Discover ${category.name} from The Ronkus Brand, made to complete your outfit with comfort and style.`;
  }
  const pageDescriptions: Record<string, string> = {
    '/academy': academyData.intro,
    '/faq': 'Find answers about ordering, custom orders, delivery, payment and the Shoemaking Academy.',
    '/contact': 'Learn the story behind The Ronkus Brand and get in touch about orders, custom pieces and more.',
  };
  return pageDescriptions[`/${segments.join('/')}`]
    ?? 'The page you are looking for could not be found. Explore The Ronkus Brand shop or return home.';
}

function updateMetaTag(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(selector);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.content = content;
}

function Router() {
  const [location] = useLocation();
  const previousLocation = useRef(location);

  useEffect(() => {
    const title = getPageTitle(location);
    const description = getPageDescription(location);
    document.title = title;
    updateMetaTag('meta[name="description"]', 'name', 'description', description);
    updateMetaTag('meta[property="og:title"]', 'property', 'og:title', title);
    updateMetaTag('meta[property="og:description"]', 'property', 'og:description', description);
    updateMetaTag('meta[property="og:url"]', 'property', 'og:url', `https://theronkusbrand.com.ng${location}`);
    const previousCategoryRoute = /^\/shop\/([^/]+)(?:\/[^/]+)?$/.exec(previousLocation.current);
    const currentCategoryRoute = /^\/shop\/([^/]+)(?:\/[^/]+)?$/.exec(location);
    const categoryFilterChanged = previousCategoryRoute
      && currentCategoryRoute
      && previousCategoryRoute[1] === currentCategoryRoute[1];

    if (previousLocation.current !== location && !categoryFilterChanged) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    previousLocation.current = location;
  }, [location]);

  return (
    <SiteLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/shop" component={ShopOverviewPage} />
          <Route path="/shop/:category/:subcategory"><CategoryRoute /></Route>
          <Route path="/shop/:category"><CategoryRootRoute /></Route>
          <Route path="/academy" component={AcademyPage} />
          <Route path="/faq" component={FaqPage} />
          <Route path="/contact" component={ContactPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </SiteLayout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <VisualViewportMetrics />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ShopProvider>
            <Router />
          </ShopProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

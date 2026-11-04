import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Instagram,
  Menu,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { contactData } from '@/data/contact';
import { useShop } from '@/components/shop-provider';
import { ShoppingCartDialog } from '@/components/shopping-cart-dialog';
import { getCategoryPath } from '@/lib/catalog';
import { buildWhatsAppUrl } from '@/lib/shop';
import { useCategories, useStoreSettings } from '@/lib/store-api';

const instagramUrl = contactData.contact.instagramUrl;
const facebookUrl = 'https://www.facebook.com/share/14sWXoMEgGM/';

function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <Link className={`brand-logo ${className}`} href="/" aria-label="The Ronkus Brand home">
      <img src="/assets/logo.png" alt="The Ronkus Brand" width="176" height="62" decoding="async" />
    </Link>
  );
}

export function HomeAnchorLink({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const [location, navigate] = useLocation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;
    event.preventDefault();
    const changingPage = location !== '/';
    if (changingPage) navigate('/');
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, changingPage ? 50 : 0);
  };

  return (
    <a className={className} href={`/#${id}`} onClick={handleClick}>
      {children}
    </a>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [location] = useLocation();
  const mobileNavRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const desktopShopButtonRef = useRef<HTMLButtonElement>(null);
  const { itemCount, setCartOpen } = useShop();
  const categoriesQuery = useCategories();

  const closeMenus = () => {
    setMobileOpen(false);
    setShopOpen(false);
  };

  const isActive = (href: string) => (
    href === '/shop' ? location === '/shop' || location.startsWith('/shop/') : location === href
  );
  const isCategoryActive = (category: NonNullable<typeof categoriesQuery.data>[number]) => {
    const categoryPath = getCategoryPath(category);
    return location === categoryPath || location.startsWith(`${categoryPath}/`);
  };

  useEffect(() => {
    closeMenus();
  }, [location]);

  useEffect(() => {
    if (!mobileOpen) return;
    const nav = mobileNavRef.current;
    if (!nav) return;
    const focusableElements = () => Array.from(
      nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    focusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenus();
        mobileMenuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!nav.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!shopOpen || mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShopOpen(false);
        desktopShopButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shopOpen, mobileOpen]);

  const exploreLinks = [
    { label: 'Shoemaking Academy', href: '/academy' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact / About Us', href: '/contact' },
  ];

  return (
    <header className="site-header">
      <div className="page-shell header-inner">
        <BrandLogo />
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link className={isActive('/') ? 'is-active' : undefined} href="/" aria-current={isActive('/') ? 'page' : undefined}>Home</Link>
          <div className="shop-nav-wrap">
            <button
              ref={desktopShopButtonRef}
              className={`nav-shop ${shopOpen ? 'is-open' : ''}${isActive('/shop') ? ' is-active' : ''}`}
              type="button"
              aria-expanded={shopOpen}
              aria-controls="shop-menu"
              aria-current={isActive('/shop') ? 'page' : undefined}
              onClick={() => setShopOpen(!shopOpen)}
            >
              Shop <ChevronDown size={14} />
            </button>
            {shopOpen && (
              <div className="shop-dropdown" id="shop-menu">
                <Link href="/shop" onClick={closeMenus} aria-current={location === '/shop' ? 'page' : undefined}>All categories</Link>
                {categoriesQuery.data?.map((category) => (
                  <Link
                    key={category.name}
                    href={getCategoryPath(category)}
                    onClick={closeMenus}
                    className={isCategoryActive(category) ? 'is-active' : undefined}
                    aria-current={isCategoryActive(category) ? 'page' : undefined}
                  >
                    {category.name}
                  </Link>
                ))}
                {categoriesQuery.isError && (
                  <button type="button" onClick={() => void categoriesQuery.refetch()}>Retry categories</button>
                )}
              </div>
            )}
          </div>
          {exploreLinks.map((item) => (
            <Link
              className={isActive(item.href) ? 'is-active' : undefined}
              href={item.href}
              key={item.label}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="cart-link"
            type="button"
            aria-label={`Open shopping bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            aria-haspopup="dialog"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={19} strokeWidth={1.6} />
            {itemCount > 0 && <span className="cart-count" aria-hidden="true">{itemCount}</span>}
          </button>
          <button
            ref={mobileMenuButtonRef}
            className="mobile-menu-button"
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="mobile-nav" id="mobile-navigation" ref={mobileNavRef} aria-label="Mobile navigation">
          <Link href="/" onClick={closeMenus} aria-current={isActive('/') ? 'page' : undefined}>Home</Link>
          <button
            className="mobile-shop-toggle"
            type="button"
            aria-expanded={shopOpen}
            aria-controls="mobile-shop-list"
            aria-current={isActive('/shop') ? 'page' : undefined}
            onClick={() => setShopOpen(!shopOpen)}
          >
            Shop <ChevronDown size={16} />
          </button>
          {shopOpen && (
            <div className="mobile-shop-list" id="mobile-shop-list">
              <Link href="/shop" onClick={closeMenus} aria-current={location === '/shop' ? 'page' : undefined}>All categories</Link>
              {categoriesQuery.data?.map((category) => (
                <Link
                  key={category.name}
                  href={getCategoryPath(category)}
                  onClick={closeMenus}
                  className={isCategoryActive(category) ? 'is-active' : undefined}
                  aria-current={isCategoryActive(category) ? 'page' : undefined}
                >
                  {category.name}
                </Link>
              ))}
              {categoriesQuery.isError && (
                <button type="button" onClick={() => void categoriesQuery.refetch()}>Retry categories</button>
              )}
            </div>
          )}
          {exploreLinks.map((item) => (
            <Link
              href={item.href}
              key={item.label}
              onClick={closeMenus}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  const categoriesQuery = useCategories();
  const settingsQuery = useStoreSettings();
  const whatsappNumber = settingsQuery.data?.whatsapp_number;

  return (
    <footer className="site-footer" id="footer">
      <div className="page-shell footer-main">
        <div className="footer-brand-column">
          <BrandLogo className="footer-logo" />
          <p>Handcrafted fashion and personal details to bring your whole look together.</p>
          <div className="footer-socials">
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="The Ronkus Brand on Instagram"><Instagram size={17} /></a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="The Ronkus Brand on Facebook">f</a>
          </div>
          <a className="footer-email" href={`mailto:${contactData.contact.email}`}>{contactData.contact.email}</a>
          {whatsappNumber ? (
            <a
              className="footer-contact-link"
              href={buildWhatsAppUrl(contactData.contact.whatsappMessage, whatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {whatsappNumber}
            </a>
          ) : (
            <span className="footer-contact-text">
              {settingsQuery.isError ? 'WhatsApp details unavailable' : 'Loading WhatsApp details'}
            </span>
          )}
          <span className="footer-contact-text">{contactData.contact.location}</span>
          <a className="footer-contact-text" href={instagramUrl} target="_blank" rel="noopener noreferrer">
            {contactData.contact.instagramHandle}
          </a>
        </div>
        <div className="footer-links-column">
          <p className="footer-column-title">Explore</p>
          <Link href="/">Home</Link>
          <Link href="/shop">Shop</Link>
          <Link href="/academy">Shoemaking Academy</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact / About Us</Link>
        </div>
        <div className="footer-links-column">
          <p className="footer-column-title">Shop categories</p>
          {categoriesQuery.data?.map((category) => (
            <Link key={category.name} href={getCategoryPath(category)}>{category.name}</Link>
          ))}
          {categoriesQuery.isError && (
            <button type="button" onClick={() => void categoriesQuery.refetch()}>Retry categories</button>
          )}
        </div>
        <div className="footer-note">
          <span>Personal expression,</span>
          <em>made tangible.</em>
          <span className="footer-flourish">TRB · BN 7907530</span>
        </div>
      </div>
      <div className="page-shell footer-bottom">
        <span>© {new Date().getFullYear()} The Ronkus Brand</span>
        <HomeAnchorLink id="home">Back to top <ArrowRight size={14} /></HomeAnchorLink>
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-to-content" href="#main-content">Skip to content</a>
      <Header />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
      <ShoppingCartDialog />
    </>
  );
}

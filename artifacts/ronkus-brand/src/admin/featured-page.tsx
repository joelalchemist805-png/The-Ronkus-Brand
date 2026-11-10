import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  listAvailableFeaturedProducts,
  listFeaturedProducts,
  saveFeaturedPositions,
  setFeaturedProduct,
  type FeaturedProduct,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminPageHeader,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import { formatNaira, renumberFeaturedPositions } from './helpers';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function FeaturedPage() {
  const [products, setProducts] = useState<FeaturedProduct[] | null>(null);
  const [availableProducts, setAvailableProducts] = useState<FeaturedProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [featured, available] = await Promise.all([
        listFeaturedProducts(),
        listAvailableFeaturedProducts(),
      ]);
      setProducts(featured);
      setAvailableProducts(available);
    } catch (error) {
      const message = errorText(error);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runChange = async (change: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await change();
      toast.success(successMessage);
    } catch (error) {
      const message = errorText(error);
      setActionError(message);
      toast.error(message);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const addProduct = (product: FeaturedProduct) => runChange(async () => {
    const reordered = [...(products ?? []), product];
    await setFeaturedProduct(product.id, {
      is_featured: true,
      featured_position: reordered.length,
    });
    await saveFeaturedPositions(renumberFeaturedPositions(reordered));
  }, `${product.name} added to Featured.`);

  const removeProduct = (product: FeaturedProduct) => runChange(async () => {
    await setFeaturedProduct(product.id, { is_featured: false, featured_position: null });
    const remaining = (products ?? []).filter(({ id }) => id !== product.id);
    await saveFeaturedPositions(renumberFeaturedPositions(remaining));
  }, `${product.name} removed from Featured.`);

  const moveProduct = (index: number, offset: -1 | 1) => runChange(async () => {
    const current = products ?? [];
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const reordered = [...current];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    await saveFeaturedPositions(renumberFeaturedPositions(reordered));
  }, 'Featured product order saved.');

  const activeFeatured = useMemo(
    () => (products ?? []).filter((product) => product.is_active),
    [products],
  );
  const homepageProducts = activeFeatured.slice(0, 12);
  const homepageProductIds = new Set(homepageProducts.map(({ id }) => id));
  const filteredAvailableProducts = availableProducts.filter((product) =>
    product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Featured products"
        description="Choose and order the products in the homepage featured collection."
      />
      <AdminCard>
        <h2>Homepage display</h2>
        <p className="admin-note">Up to 12 featured products show on your homepage, in this order.</p>
        {homepageProducts.length > 0 ? (
          <ol className="admin-featured-homepage-order">
            {homepageProducts.map((product) => <li key={product.id}>{product.name}</li>)}
          </ol>
        ) : (
          <EmptyState>No featured products yet.</EmptyState>
        )}
      </AdminCard>

      <AdminCard>
        <div className="admin-card-heading">
          <div>
            <h2>Order on your homepage</h2>
          </div>
        </div>
        {actionError && <div className="admin-alert" role="alert">{actionError}</div>}
        {loadError && <div className="admin-alert" role="alert">{loadError}</div>}
        {loading && !products ? <LoadingState label="Loading featured products…" /> : null}
        {products?.length === 0 && <EmptyState>No featured products yet.</EmptyState>}
        {products && products.length > 0 && (
          <ol className="admin-featured-list">
            {products.map((product, index) => {
              const isOnHomepage = homepageProductIds.has(product.id);
              const isOutOfStock = product.availability === 'out_of_stock';
              return (
                <li className="admin-featured-row" key={product.id}>
                  {product.photoUrl ? (
                    <img className="admin-featured-thumbnail" src={product.photoUrl} alt="" />
                  ) : (
                    <span className="admin-featured-thumbnail admin-featured-thumbnail-empty" aria-hidden="true">No photo</span>
                  )}
                  <div className="admin-featured-details">
                    <strong>{product.name}</strong>
                    <span>{formatNaira(product.price_ngn)}{product.price_suffix ? ` ${product.price_suffix}` : ''}</span>
                    <span className="admin-featured-badges">
                      {!product.is_active && <span className="admin-status">Hidden</span>}
                      {isOutOfStock && <span className="admin-status">Out of stock</span>}
                      {!isOnHomepage && (
                        <span className="admin-status">Not shown on homepage</span>
                      )}
                      {isOnHomepage && <span className="admin-status is-active">Shown on homepage</span>}
                    </span>
                  </div>
                  <span className="admin-featured-position" aria-label={`Position ${product.featured_position ?? index + 1}`}>
                    {product.featured_position ?? index + 1}
                  </span>
                  <div className="admin-featured-actions">
                    <AdminButton
                      type="button"
                      variant="secondary"
                      disabled={busy || index === 0}
                      aria-label={`Move ${product.name} up`}
                      onClick={() => void moveProduct(index, -1)}
                    >
                      Move up
                    </AdminButton>
                    <AdminButton
                      type="button"
                      variant="secondary"
                      disabled={busy || index === products.length - 1}
                      aria-label={`Move ${product.name} down`}
                      onClick={() => void moveProduct(index, 1)}
                    >
                      Move down
                    </AdminButton>
                    <ConfirmDialog
                      label={`Remove ${product.name} from Featured?`}
                      message="This removes the featured flag and renumbers the remaining featured products."
                      confirmLabel="Remove"
                      onConfirm={() => removeProduct(product)}
                    >
                      <AdminButton type="button" variant="danger" disabled={busy}>Remove</AdminButton>
                    </ConfirmDialog>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </AdminCard>

      <AdminCard>
        <h2>Add a product</h2>
        <AdminInput
          id="featured-product-search"
          label="Search active products"
          type="search"
          value={search}
          onChange={setSearch}
          placeholder="Search by product name"
        />
        {filteredAvailableProducts.length === 0 ? (
          <EmptyState>{availableProducts.length === 0 ? 'There are no active products to add.' : 'No products match your search.'}</EmptyState>
        ) : (
          <ul className="admin-featured-picker">
            {filteredAvailableProducts.map((product) => (
              <li key={product.id}>
                <span>{product.name}</span>
                <AdminButton type="button" disabled={busy} onClick={() => void addProduct(product)}>
                  Add
                </AdminButton>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}

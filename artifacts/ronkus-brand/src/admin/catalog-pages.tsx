import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  addSubcategory,
  deleteCategoryIfEmpty,
  deleteSubcategoryIfEmpty,
  listCategories,
  listDeliveryAreas,
  saveDeliveryArea,
  updateCategory,
  updateSubcategory,
  type CategoryAdminRow,
  type DeliveryArea,
  type SubcategoryAdminRow,
} from './admin-api';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminNairaInput,
  AdminNumberInput,
  AdminPageHeader,
  AdminToggle,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from './admin-components';
import { formatNaira, parseWholeNumber, slugify } from './helpers';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function useCategories() {
  const [rows, setRows] = useState<CategoryAdminRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listCategories());
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { rows, loading, refresh };
}

function CategoryEditor({ row, onRefresh }: {
  row: CategoryAdminRow;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState(row.category.name);
  const [imagePath, setImagePath] = useState(row.category.image_path);
  const [sortOrder, setSortOrder] = useState(String(row.category.sort_order));
  const [active, setActive] = useState(row.category.is_active);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const order = parseWholeNumber(sortOrder, { allowNegative: true });
    if (!name.trim() || !imagePath.trim() || order === null) {
      toast.error('Enter a name, image path, and whole-number sort order.');
      return;
    }
    setSaving(true);
    try {
      await updateCategory(row.category.id, {
        name: name.trim(),
        image_path: imagePath.trim(),
        sort_order: order,
        is_active: active,
      });
      toast.success('Category saved.');
      await onRefresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard className="admin-category-card">
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <div className="admin-card-heading">
          <div>
            <h2>{row.category.name}</h2>
            <p>{row.productCount} {row.productCount === 1 ? 'product' : 'products'} · {row.subcategories.length} subcategories</p>
          </div>
          <AdminToggle id={`category-active-${row.category.id}`} label={active ? 'Active' : 'Hidden'} checked={active} onChange={setActive} />
        </div>
        <div className="admin-form-grid">
          <AdminInput id={`category-name-${row.category.id}`} label="Category name" value={name} onChange={setName} required />
          <AdminInput id={`category-image-${row.category.id}`} label="Image path" value={imagePath} onChange={setImagePath} required />
          <AdminNumberInput id={`category-order-${row.category.id}`} label="Sort order" value={sortOrder} onChange={setSortOrder} required />
        </div>
        <div className="admin-form-actions">
          <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</AdminButton>
          {row.productCount > 0 ? (
            <span className="admin-inline-note">Categories with products can be hidden, not deleted.</span>
          ) : (
            <ConfirmDialog
              label={`Delete ${row.category.name}?`}
              message="This permanently removes the empty category and its subcategories."
              confirmLabel="Delete category"
              onConfirm={async () => {
                await deleteCategoryIfEmpty(row.category.id);
                toast.success('Category deleted.');
                await onRefresh();
              }}
            >
              <AdminButton type="button" variant="danger">Delete empty category</AdminButton>
            </ConfirmDialog>
          )}
        </div>
      </form>

      <div className="admin-subcategory-list">
        <h3>Subcategories</h3>
        {row.subcategories.length === 0
          ? <EmptyState>No subcategories yet.</EmptyState>
          : row.subcategories.map((subcategory) => (
            <SubcategoryEditor key={subcategory.subcategory.id} row={subcategory} onRefresh={onRefresh} />
          ))}
        <NewSubcategory categoryId={row.category.id} onRefresh={onRefresh} />
      </div>
    </AdminCard>
  );
}

function SubcategoryEditor({ row, onRefresh }: {
  row: SubcategoryAdminRow;
  onRefresh: () => Promise<void>;
}) {
  const { subcategory, productCount } = row;
  const [name, setName] = useState(subcategory.name);
  const [sortOrder, setSortOrder] = useState(String(subcategory.sort_order));
  const [active, setActive] = useState(subcategory.is_active);
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const order = parseWholeNumber(sortOrder, { allowNegative: true });
    if (!name.trim() || order === null) {
      toast.error('Enter a name and a whole-number sort order.');
      return;
    }
    setSaving(true);
    try {
      await updateSubcategory(subcategory.id, {
        name: name.trim(),
        sort_order: order,
        is_active: active,
      });
      toast.success('Subcategory saved.');
      await onRefresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-subcategory-row" onSubmit={(event) => void save(event)}>
      <div className="admin-form-grid">
        <AdminInput id={`subcategory-name-${subcategory.id}`} label="Name" value={name} onChange={setName} required />
        <AdminNumberInput id={`subcategory-order-${subcategory.id}`} label="Sort order" value={sortOrder} onChange={setSortOrder} required />
        <AdminToggle id={`subcategory-active-${subcategory.id}`} label={active ? 'Active' : 'Hidden'} checked={active} onChange={setActive} />
      </div>
      <div className="admin-form-actions">
        <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</AdminButton>
        {productCount > 0 ? (
          <span className="admin-inline-note">{productCount} product(s) use this subcategory; hide it instead of deleting.</span>
        ) : (
          <ConfirmDialog
            label={`Delete ${subcategory.name}?`}
            message="This permanently removes the empty subcategory."
            confirmLabel="Delete subcategory"
            onConfirm={async () => {
              await deleteSubcategoryIfEmpty(subcategory.id);
              toast.success('Subcategory deleted.');
              await onRefresh();
            }}
          >
            <AdminButton type="button" variant="danger">Delete</AdminButton>
          </ConfirmDialog>
        )}
      </div>
    </form>
  );
}

function NewSubcategory({ categoryId, onRefresh }: {
  categoryId: string;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [sortOrder, setSortOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  const changeName = (value: string) => {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const order = parseWholeNumber(sortOrder, { allowNegative: true });
    if (!name.trim() || !slugify(slug) || order === null) {
      toast.error('Enter a name, valid slug, and whole-number sort order.');
      return;
    }
    setSaving(true);
    try {
      await addSubcategory({
        category_id: categoryId,
        name: name.trim(),
        slug: slugify(slug),
        sort_order: order,
        is_active: true,
      });
      toast.success('Subcategory added.');
      setName('');
      setSlug('');
      setSlugEdited(false);
      setSortOrder('0');
      await onRefresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-new-subcategory" onSubmit={(event) => void submit(event)}>
      <h4>Add a subcategory</h4>
      <div className="admin-form-grid">
        <AdminInput id={`new-subcategory-name-${categoryId}`} label="Name" value={name} onChange={changeName} required />
        <AdminInput
          id={`new-subcategory-slug-${categoryId}`}
          label="Slug"
          value={slug}
          onChange={(value) => {
            setSlug(value);
            setSlugEdited(true);
          }}
          required
          hint="Generated from the name; editable only before creation."
        />
        <AdminNumberInput id={`new-subcategory-order-${categoryId}`} label="Sort order" value={sortOrder} onChange={setSortOrder} required />
      </div>
      <AdminButton type="submit" disabled={saving || !name.trim()}>{saving ? 'Adding…' : 'Add subcategory'}</AdminButton>
    </form>
  );
}

export function CategoriesPage() {
  const { rows, loading, refresh } = useCategories();

  return (
    <div className="admin-page">
      <AdminPageHeader title="Categories" description="Manage the storefront categories and their subcategories." />
      {loading && !rows ? <LoadingState label="Loading categories…" /> : null}
      {rows?.length === 0 && <EmptyState>No categories found.</EmptyState>}
      {rows?.map((row) => (
        <CategoryEditor key={row.category.id} row={row} onRefresh={refresh} />
      ))}
    </div>
  );
}

type DeliveryFormValues = {
  name: string;
  fee: number;
  sortOrder: number;
  active: boolean;
};

function DeliveryAreaForm({ initial, onSave, onCancel }: {
  initial: DeliveryArea | null;
  onSave: (values: DeliveryFormValues, id?: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [fee, setFee] = useState(initial ? String(initial.fee_ngn) : '');
  const [sortOrder, setSortOrder] = useState(initial ? String(initial.sort_order) : '0');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedFee = parseWholeNumber(fee);
    const parsedOrder = parseWholeNumber(sortOrder, { allowNegative: true });
    if (!name.trim() || parsedFee === null || parsedOrder === null) {
      toast.error('Enter a name, a whole naira fee of zero or more, and a whole-number sort order.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), fee: parsedFee, sortOrder: parsedOrder, active }, initial?.id);
      if (!initial) {
        setName('');
        setFee('');
        setSortOrder('0');
        setActive(true);
      }
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)}>
      <div className="admin-form-grid">
        <AdminInput id={`delivery-name-${initial?.id ?? 'new'}`} label="Area name" value={name} onChange={setName} required />
        <AdminNairaInput id={`delivery-fee-${initial?.id ?? 'new'}`} label="Delivery fee" value={fee} onChange={setFee} required />
        <AdminNumberInput id={`delivery-order-${initial?.id ?? 'new'}`} label="Sort order" value={sortOrder} onChange={setSortOrder} required />
        <AdminToggle id={`delivery-active-${initial?.id ?? 'new'}`} label={active ? 'Active' : 'Inactive'} checked={active} onChange={setActive} />
      </div>
      <div className="admin-form-actions">
        <AdminButton type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save area' : 'Add delivery area'}</AdminButton>
        {onCancel && <AdminButton type="button" variant="secondary" onClick={onCancel}>Cancel</AdminButton>}
      </div>
    </form>
  );
}

export function DeliveryPage() {
  const [areas, setAreas] = useState<DeliveryArea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAreas(await listDeliveryAreas());
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (values: DeliveryFormValues, id?: string) => {
    await saveDeliveryArea({
      name: values.name,
      fee_ngn: values.fee,
      sort_order: values.sortOrder,
      is_active: values.active,
    }, id);
    toast.success(id ? 'Delivery area saved.' : 'Delivery area added.');
    setEditingId(null);
    await refresh();
  };

  return (
    <div className="admin-page">
      <AdminPageHeader title="Delivery areas" description="Manage delivery names, fees, visibility and ordering." />
      <AdminCard>
        <p className="admin-note"><strong>Pickup is always free.</strong> Pickup is a separate fulfilment option and is not managed here.</p>
        <DeliveryAreaForm initial={null} onSave={save} />
      </AdminCard>
      {loading && !areas ? <LoadingState label="Loading delivery areas…" /> : null}
      {areas?.length === 0 && <EmptyState>No delivery areas yet.</EmptyState>}
      {areas?.map((area) => (
        <AdminCard key={area.id}>
          <div className="admin-card-heading">
            <div>
              <h2>{area.name}</h2>
              <p>{formatNaira(area.fee_ngn)} · sort order {area.sort_order}</p>
            </div>
            <span className={`admin-status ${area.is_active ? 'is-active' : ''}`}>{area.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          {editingId === area.id ? (
            <DeliveryAreaForm initial={area} onSave={save} onCancel={() => setEditingId(null)} />
          ) : (
            <div className="admin-form-actions">
              <AdminButton type="button" variant="secondary" onClick={() => setEditingId(area.id)}>Edit</AdminButton>
              <AdminButton
                type="button"
                variant="quiet"
                onClick={async () => {
                  try {
                    await saveDeliveryArea({
                      name: area.name,
                      fee_ngn: area.fee_ngn,
                      sort_order: area.sort_order,
                      is_active: !area.is_active,
                    }, area.id);
                    toast.success(area.is_active ? 'Delivery area deactivated.' : 'Delivery area activated.');
                    await refresh();
                  } catch (error) {
                    toast.error(errorText(error));
                  }
                }}
              >
                {area.is_active ? 'Deactivate' : 'Activate'}
              </AdminButton>
            </div>
          )}
        </AdminCard>
      ))}
    </div>
  );
}

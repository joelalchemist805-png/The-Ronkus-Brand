import type { CategoryRow, CategoryWithSubcategories } from '@/lib/db-types';

export function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function findCategoryBySlug(
  categories: CategoryWithSubcategories[],
  slug: string,
): CategoryWithSubcategories | undefined {
  return categories.find((category) => category.slug === slug);
}

export function findSubcategoryBySlug(
  category: CategoryWithSubcategories,
  slug: string,
) {
  return category.subcategories.find((subcategory) => subcategory.slug === slug);
}

export function getCategoryPath(category: Pick<CategoryRow, 'slug'>): string {
  return `/shop/${category.slug}`;
}

export function getSubcategoryPath(
  category: Pick<CategoryRow, 'slug'>,
  subcategory: { slug: string },
): string {
  return `${getCategoryPath(category)}/${subcategory.slug}`;
}

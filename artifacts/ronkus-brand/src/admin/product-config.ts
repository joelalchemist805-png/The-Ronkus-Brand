import type {
  CustomRequestField,
  ProductOptionGroup,
} from '@/lib/db-types';
import { slugify } from './helpers.ts';

export type OptionValueDraft = {
  value: string;
  label: string;
  price_delta: string;
  swatch: string;
  available: boolean;
};

type OptionGroupBase = {
  id: string;
  label: string;
  required: boolean;
};

export type OptionGroupDraft = OptionGroupBase & (
  | {
      type: 'choice';
      multiple: boolean;
      values: OptionValueDraft[];
    }
  | {
      type: 'range';
      min: string;
      max: string;
      step: string;
      unit: string;
      price_per_unit: string;
    }
);

type CustomFieldBase = {
  id: string;
  label: string;
  required: boolean;
  help_text: string;
};

export type CustomFieldDraft = CustomFieldBase & (
  | {
      type: 'text';
      max_length: string;
      placeholder: string;
    }
  | {
      type: 'textarea';
      max_length: string;
      placeholder: string;
    }
  | {
      type: 'number';
      min: string;
      max: string;
      step: string;
      unit: string;
    }
  | {
      type: 'measurement';
      min: string;
      max: string;
      unit: 'cm' | 'in';
    }
  | {
      type: 'choice';
      values: string[];
    }
);

export type CustomOrderDraft = {
  enabled: boolean;
  button_label: string;
  flow: 'whatsapp_quote' | 'checkout';
  fee_ngn: string;
  notice: string;
  needed_by_mode: 'off' | 'optional' | 'required';
  fields: CustomFieldDraft[];
};

export type ProductConfigurationDraftWrite = {
  options: ProductOptionGroup[];
  custom_request_enabled: boolean;
  custom_request_button_label: string;
  custom_request_flow: CustomOrderDraft['flow'];
  custom_request_fee_ngn: number;
  custom_request_notice: string | null;
  needed_by_mode: CustomOrderDraft['needed_by_mode'];
  custom_request_fields: CustomRequestField[];
};

export type ProductConfigIssue = {
  path: string;
  message: string;
};

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const swatchPattern = /^#[0-9A-Fa-f]{6}$/;

function uniqueId(label: string, ids: string[], fallback: string): string {
  const base = slugify(label) || fallback;
  let candidate = base;
  let suffix = 2;
  while (ids.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createUniqueConfigId(label: string, ids: string[], fallback = 'field'): string {
  return uniqueId(label, ids, fallback);
}

function numericValue(value: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error('Cannot convert an invalid numeric setting.');
  }
  return parsed;
}

function integerValue(value: string): number {
  const parsed = numericValue(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Cannot convert a setting that is not a safe whole number.');
  }
  return parsed;
}

export function optionGroupToDraft(group: ProductOptionGroup): OptionGroupDraft {
  if (group.type === 'choice') {
    return {
      ...group,
      values: group.values.map((value) => ({
        ...value,
        price_delta: String(value.price_delta),
        swatch: value.swatch ?? '',
      })),
    };
  }
  return {
    ...group,
    min: String(group.min),
    max: String(group.max),
    step: String(group.step),
    price_per_unit: group.price_per_unit === null ? '' : String(group.price_per_unit),
  };
}

export function optionGroupFromDraft(group: OptionGroupDraft): ProductOptionGroup {
  if (group.type === 'choice') {
    return {
      id: group.id,
      label: group.label,
      type: 'choice',
      required: group.required,
      multiple: group.multiple,
      values: group.values.map((value) => ({
        value: value.value,
        label: value.label,
        price_delta: integerValue(value.price_delta),
        swatch: value.swatch.trim() || null,
        available: value.available,
      })),
    };
  }
  return {
    id: group.id,
    label: group.label,
    type: 'range',
    required: group.required,
    min: numericValue(group.min),
    max: numericValue(group.max),
    step: numericValue(group.step),
    unit: group.unit,
    price_per_unit: group.price_per_unit.trim()
      ? integerValue(group.price_per_unit)
      : null,
  };
}

export function customFieldToDraft(field: CustomRequestField): CustomFieldDraft {
  const common = {
    id: field.id,
    label: field.label,
    required: field.required,
    help_text: field.help_text ?? '',
  };
  if (field.type === 'text') {
    return {
      ...common,
      type: 'text',
      max_length: String(field.max_length),
      placeholder: field.placeholder,
    };
  }
  if (field.type === 'textarea') {
    return {
      ...common,
      type: 'textarea',
      max_length: String(field.max_length),
      placeholder: field.placeholder,
    };
  }
  if (field.type === 'choice') {
    return { ...common, type: 'choice', values: [...field.values] };
  }
  if (field.type === 'measurement') {
    return {
      ...common,
      type: 'measurement',
      unit: field.unit,
      min: String(field.min),
      max: String(field.max),
    };
  }
  if (field.type === 'number') {
    return {
      ...common,
      type: 'number',
      min: String(field.min),
      max: String(field.max),
      step: String(field.step),
      unit: field.unit,
    };
  }
  throw new Error('Unsupported custom-request field type.');
}

export function customFieldFromDraft(field: CustomFieldDraft): CustomRequestField {
  const common = {
    id: field.id,
    label: field.label,
    required: field.required,
    help_text: field.help_text.trim() || null,
  };
  if (field.type === 'text') {
    return {
      ...common,
      type: 'text',
      max_length: integerValue(field.max_length),
      placeholder: field.placeholder,
    };
  }
  if (field.type === 'textarea') {
    return {
      ...common,
      type: 'textarea',
      max_length: integerValue(field.max_length),
      placeholder: field.placeholder,
    };
  }
  if (field.type === 'choice') {
    return { ...common, type: 'choice', values: [...field.values] };
  }
  if (field.type === 'measurement') {
    return {
      ...common,
      type: 'measurement',
      unit: field.unit,
      min: numericValue(field.min),
      max: numericValue(field.max),
    };
  }
  if (field.type === 'number') {
    return {
    ...common,
    type: 'number',
    min: numericValue(field.min),
    max: numericValue(field.max),
    step: numericValue(field.step),
    unit: field.unit,
    };
  }
  throw new Error('Unsupported custom-request field type.');
}

export function productConfigurationFromDraft(
  options: OptionGroupDraft[],
  customOrder: CustomOrderDraft,
): ProductConfigurationDraftWrite {
  return {
    options: options.map(optionGroupFromDraft),
    custom_request_enabled: customOrder.enabled,
    custom_request_button_label: customOrder.button_label.trim(),
    custom_request_flow: customOrder.flow,
    custom_request_fee_ngn: Number(customOrder.fee_ngn),
    custom_request_notice: customOrder.notice.trim() || null,
    needed_by_mode: customOrder.needed_by_mode,
    custom_request_fields: customOrder.fields.map(customFieldFromDraft),
  };
}

function validateIds(
  entries: { id: string; label: string }[],
  path: string,
  issues: ProductConfigIssue[],
): void {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (!slugPattern.test(entry.id) || ids.has(entry.id)) {
      issues.push({ path: `${path}.${index}.id`, message: 'Use a short name with lowercase letters, numbers, and hyphens.' });
    }
    if (!entry.label.trim()) {
      issues.push({ path: `${path}.${index}.label`, message: 'Enter a label.' });
    }
    ids.add(entry.id);
  });
}

function numberAtLeast(value: string, minimum: number, path: string, issues: ProductConfigIssue[]): number | null {
  const parsed = value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < minimum) {
    issues.push({ path, message: `Enter a number of at least ${minimum}.` });
    return null;
  }
  return parsed;
}

function nonnegativeInteger(value: string, path: string, issues: ProductConfigIssue[]): number | null {
  const parsed = value.trim() ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    issues.push({ path, message: 'Enter a whole number of zero or more.' });
    return null;
  }
  return parsed;
}

function validateNumericRange(
  minText: string,
  maxText: string,
  stepText: string,
  path: string,
  issues: ProductConfigIssue[],
  allowEqual: boolean,
): void {
  const minimum = numberAtLeast(minText, -Number.MAX_VALUE, `${path}.min`, issues);
  const maximum = numberAtLeast(maxText, -Number.MAX_VALUE, `${path}.max`, issues);
  const step = numberAtLeast(stepText, Number.MIN_VALUE, `${path}.step`, issues);
  if (minimum !== null && maximum !== null && (allowEqual ? minimum > maximum : minimum >= maximum)) {
    issues.push({ path: `${path}.max`, message: allowEqual ? 'Maximum must be at least the minimum.' : 'Maximum must be greater than the minimum.' });
  }
  if (minimum !== null && maximum !== null && step !== null && (maximum - minimum) / step > 200) {
    issues.push({ path: `${path}.step`, message: 'The range may contain no more than 200 steps.' });
  }
}

export function validateProductOptions(groups: OptionGroupDraft[]): ProductConfigIssue[] {
  const issues: ProductConfigIssue[] = [];
  if (groups.length > 12) issues.push({ path: 'groups', message: 'Use no more than 12 option groups.' });
  validateIds(groups, 'groups', issues);
  groups.forEach((group, groupIndex) => {
    const path = `groups.${groupIndex}`;
    if (group.type === 'choice') {
      if (group.values.length < 1 || group.values.length > 60) {
        issues.push({ path: `${path}.values`, message: 'Add between 1 and 60 choices.' });
      }
      const values = new Set<string>();
      group.values.forEach((value, valueIndex) => {
        const valuePath = `${path}.values.${valueIndex}`;
        if (!value.value.trim() || values.has(value.value)) {
          issues.push({ path: `${valuePath}.value`, message: 'Enter a different value for each choice.' });
        }
        values.add(value.value);
        if (!value.label.trim()) issues.push({ path: `${valuePath}.label`, message: 'Enter a choice label.' });
        nonnegativeInteger(value.price_delta, `${valuePath}.price_delta`, issues);
        if (value.swatch.trim() && !swatchPattern.test(value.swatch.trim())) {
          issues.push({ path: `${valuePath}.swatch`, message: 'Use a hex colour such as #AABBCC or leave it empty.' });
        }
      });
    } else {
      validateNumericRange(group.min, group.max, group.step, path, issues, false);
      if (!group.unit.trim()) issues.push({ path: `${path}.unit`, message: 'Enter a unit.' });
      if (group.price_per_unit.trim()) {
        nonnegativeInteger(group.price_per_unit, `${path}.price_per_unit`, issues);
      }
    }
  });
  return issues;
}

export function validateCustomRequest(
  config: CustomOrderDraft,
): ProductConfigIssue[] {
  const issues: ProductConfigIssue[] = [];
  if (!config.button_label.trim()) {
    issues.push({ path: 'button_label', message: 'Enter a non-empty button label.' });
  }
  if (config.enabled && config.fields.length === 0) {
    issues.push({ path: 'fields', message: 'Add at least one field when custom orders are enabled.' });
  }
  if (config.fields.length > 15) {
    issues.push({ path: 'fields', message: 'Use no more than 15 custom fields.' });
  }
  validateIds(config.fields, 'fields', issues);
  config.fields.forEach((field, index) => {
    const path = `fields.${index}`;
    if (field.type === 'text' || field.type === 'textarea') {
      const length = nonnegativeInteger(field.max_length, `${path}.max_length`, issues);
      if (length !== null && (length < 1 || length > 2000)) {
        issues.push({ path: `${path}.max_length`, message: 'Maximum length must be between 1 and 2000.' });
      }
    } else if (field.type === 'number') {
      validateNumericRange(field.min, field.max, field.step, path, issues, true);
      if (!field.unit.trim()) issues.push({ path: `${path}.unit`, message: 'Enter a unit.' });
    } else if (field.type === 'measurement') {
      if (field.unit !== 'cm' && field.unit !== 'in') {
        issues.push({ path: `${path}.unit`, message: 'Choose cm or in.' });
      }
      const minimum = numberAtLeast(field.min, -Number.MAX_VALUE, `${path}.min`, issues);
      const maximum = numberAtLeast(field.max, -Number.MAX_VALUE, `${path}.max`, issues);
      if (minimum !== null && maximum !== null && minimum > maximum) {
        issues.push({ path: `${path}.max`, message: 'Maximum must be at least the minimum.' });
      }
    } else {
      if (field.values.length < 1 || field.values.length > 30) {
        issues.push({ path: `${path}.values`, message: 'Add between 1 and 30 choices.' });
      }
      const values = new Set<string>();
      field.values.forEach((value, valueIndex) => {
        if (!value.trim() || values.has(value)) {
          issues.push({ path: `${path}.values.${valueIndex}`, message: 'Enter a non-empty, unique choice.' });
        }
        values.add(value);
      });
    }
  });
  const fee = nonnegativeInteger(config.fee_ngn, 'fee_ngn', issues);
  if (fee !== null && fee > 2_147_483_647) {
    issues.push({ path: 'fee_ngn', message: 'The fee exceeds the database integer limit.' });
  }
  return issues;
}

export function quickAddNumbers(start: number, end: number): OptionValueDraft[] {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 59) {
    throw new Error('Choose a whole-number range containing between 1 and 60 values.');
  }
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = String(start + index);
    return { value, label: value, price_delta: '0', swatch: '', available: true };
  });
}

export const shoeSizesPreset = (): OptionGroupDraft => ({
  id: 'shoe-size',
  label: 'Shoe size',
  type: 'choice',
  required: true,
  multiple: false,
  values: quickAddNumbers(35, 45),
});

export const fabricYardagePreset = (): OptionGroupDraft => ({
  id: 'yardage',
  label: 'Yardage',
  type: 'range',
  required: true,
  min: '1',
  max: '10',
  step: '1',
  unit: 'yard',
  price_per_unit: '1000',
});

export const tailoredShirtPreset = (): CustomFieldDraft[] => [
  { id: 'bust', label: 'Bust', type: 'measurement', required: true, help_text: '', unit: 'cm', min: '0', max: '200' },
  { id: 'waist', label: 'Waist', type: 'measurement', required: true, help_text: '', unit: 'cm', min: '0', max: '200' },
  { id: 'sleeve-length', label: 'Sleeve length', type: 'measurement', required: true, help_text: '', unit: 'cm', min: '0', max: '120' },
];

export const brandedApronPreset = (): CustomFieldDraft[] => [
  {
    id: 'design',
    label: 'Describe your design',
    type: 'textarea',
    required: true,
    help_text: '',
    max_length: '2000',
    placeholder: 'Describe your design',
  },
  {
    id: 'request-type',
    label: 'Request type',
    type: 'choice',
    required: true,
    help_text: '',
    values: ['Branding', 'Colour change', 'Other'],
  },
];

export function optionsRoundTrip(groups: ProductOptionGroup[]): ProductOptionGroup[] {
  return groups.map((group) => optionGroupFromDraft(optionGroupToDraft(group)));
}

export function fieldsRoundTrip(fields: CustomRequestField[]): CustomRequestField[] {
  return fields.map((field) => customFieldFromDraft(customFieldToDraft(field)));
}

export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item === undefined) return items;
  result.splice(to, 0, item);
  return result;
}

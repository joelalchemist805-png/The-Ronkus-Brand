import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomRequestField, ProductOptionGroup } from '../src/lib/db-types.ts';
import {
  brandedApronPreset,
  createUniqueConfigId,
  customFieldFromDraft,
  customFieldToDraft,
  fabricYardagePreset,
  fieldsRoundTrip,
  optionGroupFromDraft,
  optionGroupToDraft,
  optionsRoundTrip,
  quickAddNumbers,
  shoeSizesPreset,
  tailoredShirtPreset,
  validateCustomRequest,
  validateProductOptions,
  type CustomFieldDraft,
  type CustomOrderDraft,
  type OptionGroupDraft,
} from '../src/admin/product-config.ts';

const choiceGroup = (): OptionGroupDraft => ({
  id: 'size',
  label: 'Size',
  type: 'choice',
  required: true,
  multiple: false,
  values: [{ value: 'M', label: 'Medium', price_delta: '0', swatch: '', available: true }],
});

const rangeGroup = (): OptionGroupDraft => ({
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

const customOrder = (fields: CustomFieldDraft[] = []): CustomOrderDraft => ({
  enabled: false,
  button_label: 'Request custom order',
  flow: 'whatsapp_quote',
  fee_ngn: '0',
  notice: '',
  needed_by_mode: 'off',
  fields,
});

const fieldBase = {
  id: 'details',
  label: 'Details',
  required: true,
  help_text: '',
};

function optionErrors(groups: OptionGroupDraft[]): string[] {
  return validateProductOptions(groups).map((issue) => issue.message);
}

function customErrors(config: CustomOrderDraft): string[] {
  return validateCustomRequest(config).map((issue) => issue.message);
}

test('slug and id generation create valid, unique ids', () => {
  assert.equal(createUniqueConfigId('Étoile Shoe Size', []), 'etoile-shoe-size');
  assert.equal(createUniqueConfigId('Shoe Size', ['shoe-size']), 'shoe-size-2');
  assert.equal(createUniqueConfigId('', ['option', 'option-2'], 'option'), 'option-3');
  assert.deepEqual(optionErrors([
    { ...choiceGroup(), id: 'size' },
    { ...choiceGroup(), id: 'size' },
  ]).length > 0, true);
});

test('choice option groups enforce database limits, labels, unique values, prices, and swatches', () => {
  assert.deepEqual(optionErrors([choiceGroup()]), []);
  assert.ok(optionErrors([{ ...choiceGroup(), id: 'Not valid' }]).length);
  assert.ok(optionErrors([{ ...choiceGroup(), label: '  ' }]).length);
  assert.ok(optionErrors([{ ...choiceGroup(), values: [] }]).length);
  assert.ok(optionErrors([{ ...choiceGroup(), values: Array.from({ length: 61 }, (_, index) => ({
    value: String(index),
    label: String(index),
    price_delta: '0',
    swatch: '',
    available: true,
  })) }]).some((message) => message.includes('between 1 and 60')));
  assert.ok(optionErrors([{ ...choiceGroup(), values: [
    { value: 'same', label: 'One', price_delta: '0', swatch: '', available: true },
    { value: 'same', label: 'Two', price_delta: '0', swatch: '', available: true },
  ] }]).length);
  assert.ok(optionErrors([{ ...choiceGroup(), values: [
    { value: ' ', label: '', price_delta: '1.2', swatch: '', available: true },
  ] }]).length >= 3);
  assert.ok(optionErrors([{ ...choiceGroup(), values: [
    { value: 'red', label: 'Red', price_delta: '0', swatch: '#FFF', available: true },
  ] }]).some((message) => message.includes('hex colour')));
  assert.deepEqual(optionErrors([{ ...choiceGroup(), values: [
    { value: 'red', label: 'Red', price_delta: '0', swatch: '#aAbBcC', available: true },
  ] }]), []);
  assert.ok(optionErrors(Array.from({ length: 13 }, (_, index) => ({
    ...choiceGroup(),
    id: `size-${index}`,
  }))).some((message) => message.includes('12 option groups')));
});

test('range option groups mirror SQL ordering, positive step, step-count, unit, and price rules', () => {
  assert.deepEqual(optionErrors([rangeGroup()]), []);
  assert.deepEqual(optionErrors([{ ...rangeGroup(), price_per_unit: '' }]), []);
  assert.ok(optionErrors([{ ...rangeGroup(), min: '10', max: '10' }]).length);
  assert.ok(optionErrors([{ ...rangeGroup(), step: '0' }]).length);
  assert.ok(optionErrors([{ ...rangeGroup(), step: '-1' }]).length);
  assert.ok(optionErrors([{ ...rangeGroup(), min: '0', max: '201', step: '1' }]).some((message) => message.includes('200 steps')));
  assert.ok(optionErrors([{ ...rangeGroup(), unit: ' ' }]).length);
  assert.ok(optionErrors([{ ...rangeGroup(), price_per_unit: '-1' }]).length);
  assert.ok(optionErrors([{ ...rangeGroup(), price_per_unit: '1.5' }]).length);
});

test('quick add numbers creates inclusive zero-priced available values and guards invalid spans', () => {
  assert.deepEqual(quickAddNumbers(35, 37), [
    { value: '35', label: '35', price_delta: '0', swatch: '', available: true },
    { value: '36', label: '36', price_delta: '0', swatch: '', available: true },
    { value: '37', label: '37', price_delta: '0', swatch: '', available: true },
  ]);
  assert.throws(() => quickAddNumbers(1.5, 3));
  assert.throws(() => quickAddNumbers(1, 62));
});

test('custom fields enforce common properties, IDs, count, and enabled-needs-a-field rule', () => {
  assert.deepEqual(customErrors(customOrder([{
    ...fieldBase,
    type: 'text',
    max_length: '200',
    placeholder: '',
  }])), []);
  assert.ok(customErrors(customOrder()).length === 0);
  assert.ok(customErrors({ ...customOrder(), enabled: true }).some((message) => message.includes('at least one field')));
  assert.ok(customErrors(customOrder([{ ...fieldBase, id: 'bad id', type: 'text', max_length: '10', placeholder: '' }])).length);
  assert.ok(customErrors(customOrder([
    { ...fieldBase, type: 'text', max_length: '10', placeholder: '' },
    { ...fieldBase, type: 'text', max_length: '10', placeholder: '' },
  ])).length);
  assert.ok(customErrors(customOrder(Array.from({ length: 16 }, (_, index) => ({
    ...fieldBase,
    id: `field-${index}`,
    type: 'text' as const,
    max_length: '10',
    placeholder: '',
  })))).some((message) => message.includes('15 custom fields')));
  assert.ok(customErrors({ ...customOrder([{
    ...fieldBase,
    type: 'text',
    max_length: '10',
    placeholder: '',
  }]), button_label: '  ' }).some((message) => message.includes('button label')));
  assert.ok(customErrors({ ...customOrder([{
    ...fieldBase,
    type: 'text',
    max_length: '10',
    placeholder: '',
  }]), fee_ngn: '1.5' }).length);
});

test('text and textarea custom fields enforce max_length and required SQL properties', () => {
  for (const type of ['text', 'textarea'] as const) {
    assert.deepEqual(customErrors(customOrder([{ ...fieldBase, type, max_length: '2000', placeholder: '' }])), []);
    for (const length of ['0', '2001', '1.5', '']) {
      assert.ok(customErrors(customOrder([{ ...fieldBase, type, max_length: length, placeholder: '' }])).length);
    }
  }
});

test('number custom fields enforce min/max, positive step, maximum step count, and unit', () => {
  const field: CustomFieldDraft = {
    ...fieldBase,
    type: 'number',
    min: '0',
    max: '10',
    step: '0.5',
    unit: 'cm',
  };
  assert.deepEqual(customErrors(customOrder([field])), []);
  assert.ok(customErrors(customOrder([{ ...field, min: '11', max: '10' }])).length);
  assert.ok(customErrors(customOrder([{ ...field, step: '0' }])).length);
  assert.ok(customErrors(customOrder([{ ...field, min: '0', max: '201', step: '1' }])).length);
  assert.ok(customErrors(customOrder([{ ...field, unit: ' ' }])).length);
});

test('measurement and choice custom fields enforce units, bounds, value counts, and uniqueness', () => {
  const measurement: CustomFieldDraft = {
    ...fieldBase,
    type: 'measurement',
    min: '0',
    max: '200',
    unit: 'cm',
  };
  assert.deepEqual(customErrors(customOrder([measurement])), []);
  assert.deepEqual(customErrors(customOrder([{ ...measurement, unit: 'in' }])), []);
  assert.ok(customErrors(customOrder([{ ...measurement, unit: 'yard' as 'cm' }] )).length);
  assert.ok(customErrors(customOrder([{ ...measurement, min: '201', max: '200' }])).length);
  assert.deepEqual(customErrors(customOrder([{ ...fieldBase, type: 'choice', values: ['Branding', 'Other'] }])), []);
  assert.ok(customErrors(customOrder([{ ...fieldBase, type: 'choice', values: [] }])).length);
  assert.ok(customErrors(customOrder([{ ...fieldBase, type: 'choice', values: ['A', 'A'] }])).length);
  assert.ok(customErrors(customOrder([{ ...fieldBase, type: 'choice', values: [' '] }])).length);
  assert.ok(customErrors({ ...customOrder([{
    ...fieldBase,
    type: 'choice',
    values: Array.from({ length: 31 }, (_, index) => `choice-${index}`),
  }]) }).some((message) => message.includes('1 and 30')));
});

test('option and custom-field draft conversions round-trip exact database json shapes', () => {
  const dbOptions: ProductOptionGroup[] = [
    {
      id: 'colour',
      label: 'Colour',
      type: 'choice',
      required: false,
      multiple: true,
      values: [{ value: 'blue', label: 'Blue', price_delta: 250, swatch: '#1122Aa', available: false }],
    },
    {
      id: 'yardage',
      label: 'Yardage',
      type: 'range',
      required: true,
      min: 1,
      max: 10,
      step: 0.5,
      unit: 'yard',
      price_per_unit: null,
    },
  ];
  const dbFields: CustomRequestField[] = [
    { id: 'name', label: 'Name', type: 'text', required: true, help_text: null, max_length: 100, placeholder: 'Your name' },
    { id: 'details', label: 'Details', type: 'textarea', required: false, help_text: 'Add notes', max_length: 2000, placeholder: 'More details' },
    { id: 'length', label: 'Length', type: 'number', required: true, help_text: null, min: 1, max: 10, step: 0.5, unit: 'cm' },
    { id: 'bust', label: 'Bust', type: 'measurement', required: true, help_text: null, unit: 'in', min: 0, max: 80 },
    { id: 'design', label: 'Design', type: 'choice', required: true, help_text: null, values: ['Branding', 'Other'] },
  ];
  assert.deepEqual(optionsRoundTrip(dbOptions), dbOptions);
  assert.deepEqual(fieldsRoundTrip(dbFields), dbFields);
  for (const option of dbOptions) {
    assert.deepEqual(optionGroupFromDraft(optionGroupToDraft(option)), option);
  }
  for (const field of dbFields) {
    assert.deepEqual(customFieldFromDraft(customFieldToDraft(field)), field);
  }
});

test('migration comment presets produce valid database-shaped output', () => {
  assert.deepEqual(validateProductOptions([shoeSizesPreset()]), []);
  assert.deepEqual(validateProductOptions([fabricYardagePreset()]), []);
  assert.deepEqual(validateCustomRequest(customOrder(tailoredShirtPreset())), []);
  assert.deepEqual(validateCustomRequest(customOrder(brandedApronPreset())), []);
  assert.equal(optionGroupFromDraft(fabricYardagePreset()).type, 'range');
});

import type { JsonObject, JsonSchema, JsonValue } from './types';

/** Raw text values keyed by property name (checkboxes use "true"/"false"). */
export type FieldValues = Record<string, string>;

export function schemaType(schema: JsonSchema | undefined): string {
  if (!schema?.type) return schema?.enum ? 'string' : 'object';
  return Array.isArray(schema.type) ? (schema.type.find((type) => type !== 'null') ?? 'string') : schema.type;
}

export function initialValues(schema: JsonSchema): FieldValues {
  const values: FieldValues = {};
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.default !== undefined) {
      values[name] = typeof prop.default === 'string' ? prop.default : JSON.stringify(prop.default);
    } else {
      values[name] = schemaType(prop) === 'boolean' ? 'false' : '';
    }
  }
  return values;
}

/** Form text → JSON arguments, with per-field errors. Empty optional fields are omitted. */
export function toArguments(schema: JsonSchema, values: FieldValues): { value: JsonObject; errors: Record<string, string> } {
  const value: JsonObject = {};
  const errors: Record<string, string> = {};
  const required = new Set(schema.required ?? []);
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const raw = (values[name] ?? '').trim();
    const type = schemaType(prop);
    if (type === 'boolean') {
      value[name] = raw === 'true';
      continue;
    }
    if (!raw) {
      if (required.has(name)) errors[name] = 'Required.';
      continue;
    }
    if (type === 'integer' || type === 'number') {
      const parsed = Number(raw);
      if (Number.isNaN(parsed) || (type === 'integer' && !Number.isInteger(parsed))) {
        errors[name] = `Must be ${type === 'integer' ? 'an integer' : 'a number'}.`;
      } else value[name] = parsed;
      continue;
    }
    if (type === 'array') {
      const itemType = schemaType(prop.items);
      if (raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw) as JsonValue;
          if (Array.isArray(parsed)) value[name] = parsed;
          else errors[name] = 'Must be a JSON array.';
        } catch {
          errors[name] = 'Invalid JSON array.';
        }
      } else {
        const items = raw.split(',').map((item) => item.trim()).filter(Boolean);
        value[name] = itemType === 'integer' || itemType === 'number' ? items.map(Number) : items;
      }
      continue;
    }
    if (type === 'object') {
      try {
        const parsed = JSON.parse(raw) as JsonValue;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value[name] = parsed;
        else errors[name] = 'Must be a JSON object.';
      } catch {
        errors[name] = 'Invalid JSON object.';
      }
      continue;
    }
    value[name] = raw;
  }
  return { value, errors };
}

export function parseJsonObject(text: string): { value?: JsonObject; error?: string } {
  if (!text.trim()) return { value: {} };
  try {
    const parsed = JSON.parse(text) as JsonValue;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { value: parsed };
    return { error: 'Arguments must be a JSON object.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

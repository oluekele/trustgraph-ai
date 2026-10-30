'use client';

import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { type FieldValues, schemaType } from '@/lib/schema';
import type { JsonSchema } from '@/lib/types';

/** Form generated from a tool's JSON-schema parameters. */
export function SchemaForm({
  schema,
  values,
  errors,
  onChange,
  placeholders = {},
  disabled,
}: {
  schema: JsonSchema;
  values: FieldValues;
  errors: Record<string, string>;
  onChange: (values: FieldValues) => void;
  placeholders?: Record<string, string>;
  disabled?: boolean;
}) {
  const properties = Object.entries(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  if (!properties.length) return <p className="text-xs text-muted">This tool takes no arguments.</p>;
  const set = (name: string, value: string) => onChange({ ...values, [name]: value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {properties.map(([name, prop]) => {
        const type = schemaType(prop);
        if (type === 'boolean') {
          return (
            <Checkbox
              key={name}
              label={name}
              description={prop.description}
              checked={values[name] === 'true'}
              disabled={disabled}
              onChange={(event) => set(name, String(event.target.checked))}
              className="sm:col-span-2"
            />
          );
        }
        const wide = type === 'object' || name === 'body' || name === 'content';
        const hint =
          prop.description ??
          (type === 'array'
            ? 'Comma-separated values or a JSON array.'
            : type === 'object'
              ? 'JSON object.'
              : undefined);
        return (
          <Field
            key={name}
            label={
              <>
                {name} <span className="font-normal text-muted">({type})</span>
              </>
            }
            required={required.has(name)}
            hint={hint}
            error={errors[name]}
            className={wide ? 'sm:col-span-2' : undefined}
          >
            {(id, describedBy) =>
              prop.enum ? (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={values[name] ?? ''}
                  disabled={disabled}
                  onChange={(event) => set(name, event.target.value)}
                >
                  <option value="">Select…</option>
                  {prop.enum.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {String(option)}
                    </option>
                  ))}
                </Select>
              ) : wide ? (
                <Textarea
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={errors[name] ? true : undefined}
                  className="font-mono text-xs"
                  value={values[name] ?? ''}
                  disabled={disabled}
                  placeholder={placeholders[name] ?? (type === 'object' ? '{}' : '')}
                  onChange={(event) => set(name, event.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={errors[name] ? true : undefined}
                  type={type === 'integer' || type === 'number' ? 'number' : 'text'}
                  step={type === 'number' ? 'any' : undefined}
                  value={values[name] ?? ''}
                  disabled={disabled}
                  placeholder={placeholders[name]}
                  onChange={(event) => set(name, event.target.value)}
                />
              )
            }
          </Field>
        );
      })}
    </div>
  );
}

/**
 * zodResolver compatible con Zod v4.
 *
 * @hookform/resolvers v3 revisa `error.errors` (alias de Zod v3).
 * Zod v4 solo expone `error.issues` — el check falla y relanza la excepción
 * en lugar de convertirla a errores de campo.
 *
 * Este resolver usa `safeParseAsync` y mapea `error.issues` directamente.
 */

import type { Resolver, FieldValues, ResolverOptions } from 'react-hook-form';
import type { ZodSchema, ZodError } from 'zod';
import { toNestErrors } from '@hookform/resolvers';

function isZodError(e: unknown): e is ZodError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'issues' in e &&
    Array.isArray((e as ZodError).issues)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseIssues(issues: ZodError['issues']): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors: Record<string, any> = {};

  for (const issue of issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = { message: issue.message, type: issue.code };
    }
  }

  return errors;
}

export function zodResolver<T extends FieldValues>(
  schema: ZodSchema<T>
): Resolver<T> {
  return async (values, _ctx, options: ResolverOptions<T>) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return { values: result.data, errors: {} };
    }

    if (isZodError(result.error)) {
      const flat = parseIssues(result.error.issues);
      return {
        values: {},
        errors: toNestErrors(flat, options),
      };
    }

    throw result.error;
  };
}

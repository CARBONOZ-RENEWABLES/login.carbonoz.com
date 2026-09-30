import { BadRequestException } from '@nestjs/common';
import { isObjectId } from 'src/tenancy/tenancy.service';
import { escapeRegex } from './email';

/**
 * Query-string readers for list endpoints. Express parses `?a[$ne]=x` into an
 * object, so every value is checked to be one plain string before it reaches
 * a Prisma filter.
 */
export function queryString(
  v: unknown,
  name: string,
  max = 200,
): string | undefined {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string' || v.length > max)
    throw new BadRequestException(`Invalid ${name}`);
  return v.trim() || undefined;
}

export function queryId(v: unknown, name: string): string | undefined {
  const s = queryString(v, name, 24);
  if (s !== undefined && !isObjectId(s))
    throw new BadRequestException(`Invalid ${name}`);
  return s;
}

export function queryEnum<T extends string>(
  v: unknown,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const s = queryString(v, name, 50);
  if (s !== undefined && !allowed.includes(s as T))
    throw new BadRequestException(`Invalid ${name}`);
  return s as T | undefined;
}

export function queryInt(
  v: unknown,
  name: string,
  { def, min, max }: { def: number; min: number; max: number },
): number {
  const s = queryString(v, name, 10);
  if (s === undefined) return def;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new BadRequestException(`Invalid ${name}`);
  return n;
}

export function queryBool(v: unknown, name: string): boolean | undefined {
  const s = queryString(v, name, 5);
  if (s === undefined) return undefined;
  if (s !== 'true' && s !== 'false')
    throw new BadRequestException(`Invalid ${name}`);
  return s === 'true';
}

/**
 * Case-insensitive "contains" filter from user input. Prisma turns insensitive
 * `contains` into a regex on MongoDB, so the input is escaped (as in admin search).
 */
export function containsFilter(q: string | undefined) {
  return q
    ? { contains: escapeRegex(q), mode: 'insensitive' as const }
    : undefined;
}

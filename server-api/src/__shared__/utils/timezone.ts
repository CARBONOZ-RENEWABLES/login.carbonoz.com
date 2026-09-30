import { ValidateBy, ValidationOptions } from 'class-validator';

/** IANA shape: `UTC` or `Area/Location[/More]`, each part starting with a capital. */
const IANA_SHAPE = /^(UTC|[A-Z][A-Za-z0-9_+-]*(\/[A-Z][A-Za-z0-9_+-]*)+)$/;

/**
 * A real IANA time zone name, e.g. `Europe/Berlin`, `Asia/Kolkata`, `UTC`.
 * Checked with the runtime's own zone data (Intl), which also knows DST rules.
 * Rejected: typos (`Europe/Berlinn`), offsets (`+02:00`), abbreviations
 * (`CET`, `EST`) and wrong spellings of a real name (`europe/berlin`), so
 * the stored value is always the name an admin picked, never a guess.
 */
export function isIanaTimeZone(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 64 || !IANA_SHAPE.test(v))
    return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en-US', {
      timeZone: v,
    }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  // Intl ignores case: `Europe/BERLIN` resolves to `Europe/Berlin`. Aliases
  // such as `Asia/Kolkata` (→ `Asia/Calcutta` in some ICU versions) are fine.
  return resolved === v || resolved.toLowerCase() !== v.toLowerCase();
}

export const TIMEZONE_MESSAGE =
  'timezone must be a valid IANA time zone name, e.g. Europe/Berlin, Africa/Kigali or UTC';

export function IsIanaTimeZone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isIanaTimeZone',
      validator: {
        validate: (v) => isIanaTimeZone(v),
        defaultMessage: () => TIMEZONE_MESSAGE,
      },
    },
    options,
  );
}

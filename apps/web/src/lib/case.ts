const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
const toSnake = (key: string) => key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

function mapKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, convert));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [convert(key), mapKeys(inner, convert)]),
    );
  }
  return value;
}

/** Legacy API payloads (snake_case) into domain objects (camelCase). */
export const camelizeKeys = (value: unknown): unknown => mapKeys(value, toCamel);

/** Domain objects (camelCase) into legacy API payloads (snake_case). */
export const snakeizeKeys = (value: unknown): unknown => mapKeys(value, toSnake);

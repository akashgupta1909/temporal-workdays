const PREFIX = 'temporal-workdays: ';

export function rangeError(message: string): RangeError {
  return new RangeError(PREFIX + message);
}

export function typeError(message: string): TypeError {
  return new TypeError(PREFIX + message);
}

/** Describes any value for an error message without ever throwing (unlike `String(value)`). */
export function describe(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return 'a function';
    case 'object':
      return value === null ? 'null' : Object.prototype.toString.call(value);
  }
}

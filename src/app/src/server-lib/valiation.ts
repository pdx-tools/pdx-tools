import { ValidationError } from "./errors";

export function narrowString(data: any): string | null {
  if (typeof data !== "string") {
    return null;
  } else {
    return data;
  }
}

export function narrowNumber(data: any): number | null {
  if (typeof data !== "number") {
    if (typeof data === "string") {
      return narrowNumber(parseInt(data, 10));
    } else {
      return null;
    }
  } else if (isNaN(data)) {
    return null;
  } else {
    return data;
  }
}

function getValue(data: any, field: string): any {
  const splitted = field.split(".");
  let value = data;
  for (let i = 0; i < splitted.length; i++) {
    const element = splitted[i];
    value = value?.[element];
  }
  return value;
}

export function getOptionalString(data: any, field: string): string | null {
  const value = getValue(data, field);
  if (value === undefined || value === null) {
    return null;
  } else if (narrowString(value) === null) {
    throw new ValidationError(`expected ${field} to be a valid string`);
  } else {
    return value;
  }
}

export function getString(data: any, field: string): string {
  const value = getOptionalString(data, field);
  if (value === null) {
    throw new ValidationError(`expected ${field} to be a valid string`);
  } else {
    return value;
  }
}

export function getNumber(data: any, field: string): number {
  const value = getValue(data, field);
  if (value === undefined || narrowNumber(value) === null) {
    throw new ValidationError(`expected ${field} to be a valid number`);
  } else {
    return value;
  }
}

export function getArray<T>(
  data: any,
  field: string,
  narrower: (x: any) => T | null
): T[] {
  const value = getValue(data, field);
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`expected ${field} to be a valid array`);
  }

  const values = value as any[];

  const result = [];
  for (let i = 0; i < values.length; i++) {
    const element = values[i];
    if (narrower(element) === null) {
      throw new ValidationError(`invalid value at ${field}[${i}]`);
    } else {
      result.push(element);
    }
  }

  return result;
}

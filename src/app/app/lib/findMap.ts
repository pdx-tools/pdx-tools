export function findMap<T, R>(
  arr: T[],
  pred: (x: T, i: number) => R | undefined,
): R | undefined {
  for (let i = 0; i < arr.length; i++) {
    const result = pred(arr[i], i);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

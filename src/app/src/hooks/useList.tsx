type OverflowOptions = {
  variant: "overflow";
  max: number;
};

type BalanceOptions = {
  variant: "balance";
  threshold: number;
};

type ListVariantOptions = OverflowOptions | BalanceOptions;

export function useList<T>(arg: { data: T[] } & OverflowOptions): {
  items: T[];
  overflow: T[];
};

export function useList<T>(arg: { data: T[] } & BalanceOptions): {
  items: T[][];
};

export function useList<T>({
  data,
  ...options
}: { data: T[] } & ListVariantOptions) {
  switch (options.variant) {
    case "overflow": {
      const needsOverflow = data.length > options.max;
      const breakPoint = needsOverflow ? options.max - 1 : options.max;
      return {
        items: data.slice(0, breakPoint),
        overflow: data.slice(breakPoint),
      };
    }
    case "balance": {
      const bal = Math.sqrt(data.length);
      const cols = Math.max(Math.ceil(bal), options.threshold);
      const rows = Math.ceil(data.length / cols);
      const result = [];
      for (let i = 0; i < rows; i++) {
        result.push(data.slice(i * cols, (i + 1) * cols));
      }
      return { items: result };
    }
  }
}

export async function fetchOk(...args: Parameters<typeof fetch>) {
  const resp = await fetch(...args);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`failed to fetch: ${body}`);
  }

  return resp;
}

export async function fetchOkJson<T = any>(
  ...args: Parameters<typeof fetch>
): Promise<T> {
  return fetchOk(...args).then((x) => x.json());
}

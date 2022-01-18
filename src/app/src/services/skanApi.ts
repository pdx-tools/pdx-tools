export const fetchSkanSave = async (
  skanId: string,
  signal?: AbortSignal | null
) => {
  // Unable to stream this as the skanderbeg saves as the content-length does
  // not actually match the body as the body is compressed twice and the
  // reported length is only the first compression
  const url = `https://skanderbeg.pm/api.php?scope=downloadSaveFile&id=${skanId}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`skanderbeg fetch error: ${await response.text()}`);
  }

  return await response.arrayBuffer();
};

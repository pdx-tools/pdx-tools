export const extractSaveId = (url: string): string => {
  try {
    const u = new URL(url);
    return u.searchParams.get("id") || url;
  } catch {
    return url;
  }
};

import { useEffect, useState } from "react";

const getMatches = (query: string) => !!window?.matchMedia(query)?.matches;

// https://usehooks-ts.com/react-hook/use-media-query
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const handleChange = () => setMatches(getMatches(query));
    const matchMedia = window.matchMedia(query);
    handleChange();
    matchMedia.addEventListener("change", handleChange);
    return () => {
      matchMedia.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}

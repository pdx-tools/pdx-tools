import { useRouter } from "next/router";

export const Eu4Analyze = () => {
  const router = useRouter();

  if (typeof window !== "undefined") {
    router.push("/");
  }

  return null;
};

export default Eu4Analyze;

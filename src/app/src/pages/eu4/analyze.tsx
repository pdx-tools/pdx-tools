import { useRouter } from "next/router";
import React from "react";

export const Eu4Analyze = () => {
  const router = useRouter();

  if (typeof window !== "undefined") {
    router.push("/");
  }

  return null;
};

export default Eu4Analyze;

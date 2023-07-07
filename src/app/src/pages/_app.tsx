import React from "react";
import { AppProps } from "next/app";
import "@/styles/styles.css";
import "@/styles/tailwind.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/appApi";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <Component {...pageProps} />
    </QueryClientProvider>
  );
}

export default MyApp;

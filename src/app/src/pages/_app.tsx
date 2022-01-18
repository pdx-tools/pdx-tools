import React from "react";
import { AppProps } from "next/app";
import "antd/dist/antd.css";
import "../styles/styles.css";
import { Provider } from "react-redux";
import { store } from "../lib/store";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Provider store={store}>
      <Component {...pageProps} />
    </Provider>
  );
}

export default MyApp;

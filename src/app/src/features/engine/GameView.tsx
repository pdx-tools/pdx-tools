import { useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { resetSaveAnalysis, selectAnalyzeGame } from "./engineSlice";
import { Ck3View } from "./views/Ck3View";
import { Eu4View } from "./views/Eu4View";
import { Hoi4View } from "./views/Hoi4View";
import { ImperatorView } from "./views/ImperatorView";

export const GameView: React.FC<{}> = () => {
  const game = useSelector(selectAnalyzeGame);
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    if (window.location.pathname === "/") {
      dispatch(resetSaveAnalysis());
    }
  }, [dispatch]);

  useEffect(() => {
    const routeMe = window.location.pathname !== "/";

    // Allow users to hit the back button when they are locally analyzing a
    // file to go back to the home menu so they can analyze another file
    // ergonomically.
    function popHandler(_event: PopStateEvent) {
      dispatch(resetSaveAnalysis());

      // Using the native window handler means that next.js kinda lost track
      // so we reload the page.
      if (routeMe) {
        router.reload();
      }
    }

    if (!routeMe) {
      history.pushState(undefined, "", null);
    }

    window.addEventListener("popstate", popHandler);
    return () => {
      window.removeEventListener("popstate", popHandler);
    };
  }, [dispatch, router]);

  useEffect(() => {
    function reset() {
      dispatch(resetSaveAnalysis());
    }

    // To ensure that when someone clicks on "PDX Tools" in app header
    // that analysis is reset
    router.events.on("routeChangeComplete", reset);
    return () => {
      router.events.off("routeChangeComplete", reset);
    };
  }, [dispatch, router.events]);

  switch (game) {
    case "ck3": {
      return <Ck3View />;
    }
    case "eu4": {
      return <Eu4View />;
    }
    case "hoi4": {
      return <Hoi4View />;
    }
    case "imperator": {
      return <ImperatorView />;
    }
    case null: {
      return null;
    }
  }
};

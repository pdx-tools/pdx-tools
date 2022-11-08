import { useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { resetSaveAnalysis, selectAnalyzeGame } from "./engineSlice";
import { Ck3View } from "./views/Ck3View";
import { Eu4View } from "./views/Eu4View";
import { Hoi4View } from "./views/Hoi4View";
import { ImperatorView } from "./views/ImperatorView";
import { Vic3View } from "./views/Vic3View";

export const GameView = () => {
  const game = useSelector(selectAnalyzeGame);
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    if (window.location.pathname === "/") {
      dispatch(resetSaveAnalysis());
    }
  }, [dispatch]);

  useEffect(() => {
    const homeAnalysis = window.location.pathname === "/";

    // Allow users to hit the back button when they are locally analyzing a
    // file to go back to the home menu so they can analyze another file
    // ergonomically.
    function popHandler(_event: PopStateEvent) {
      dispatch(resetSaveAnalysis());

      if (homeAnalysis && game !== null) {
        history.back();
      }
    }

    if (homeAnalysis && game !== null) {
      history.pushState(undefined, "", null);
    }

    window.addEventListener("popstate", popHandler);
    return () => {
      window.removeEventListener("popstate", popHandler);
    };
  }, [dispatch, router, game]);

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

  useEffect(() => {
    return () => {
      dispatch(resetSaveAnalysis());
    };
  }, [dispatch]);

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
    case "vic3": {
      return <Vic3View />;
    }
    case null: {
      return null;
    }
  }
};

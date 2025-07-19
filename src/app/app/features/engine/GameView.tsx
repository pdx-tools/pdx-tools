import {
  ComponentProps,
  ComponentType,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { WebPage } from "@/components/layout";
import { PageDropOverlay } from "./components/PageDropOverlay";
import {
  SaveGameInput,
  useEngineActions,
  useSaveFileInput,
} from "./engineStore";
import classes from "./GameView.module.css";
import type Eu4Ui from "@/features/eu4/Eu4Ui";
import type Ck3Ui from "@/features/ck3/Ck3Ui";
import type Hoi4Ui from "@/features/hoi4/Hoi4Ui";
import type ImperatorUi from "@/features/imperator/ImperatorUi";
import type Vic3Ui from "@/features/vic3/vic3Ui";
import { timeit } from "@/lib/timeit";
import { logMs } from "@/lib/log";
import { useWindowMessageDrop } from "./hooks/useWindowMessageDrop";

function timeModule<T>(fn: () => Promise<T>, module: string): () => Promise<T> {
  return () =>
    timeit(fn).then((x) => {
      if (typeof window !== "undefined") {
        logMs(x, `load ${module} module`);
      }
      return x.data;
    });
}

const DynamicEu4: ComponentType<ComponentProps<typeof Eu4Ui>> = lazy(
  timeModule(() => import("@/features/eu4/Eu4Ui"), "eu4"),
);

const DynamicCk3: ComponentType<ComponentProps<typeof Ck3Ui>> = lazy(
  timeModule(() => import("@/features/ck3/Ck3Ui"), "ck3"),
);

const DynamicHoi4: ComponentType<ComponentProps<typeof Hoi4Ui>> = lazy(
  timeModule(() => import("@/features/hoi4/Hoi4Ui"), "hoi4"),
);

const DynamicImperator: ComponentType<ComponentProps<typeof ImperatorUi>> =
  lazy(
    timeModule(() => import("@/features/imperator/ImperatorUi"), "imperator"),
  );

const DynamicVic3: ComponentType<ComponentProps<typeof Vic3Ui>> = lazy(
  timeModule(() => import("@/features/vic3/vic3Ui"), "vic3"),
);

const gameRenderer = (savegame: SaveGameInput | null) => {
  switch (savegame?.kind) {
    case undefined:
      return null;
    case "eu4":
      return {
        kind: "full-screen",
        component: () => (
          <Suspense fallback={null}>
            <DynamicEu4 save={savegame.data} />
          </Suspense>
        ),
      } as const;
    case "ck3":
      return {
        kind: "in-screen",
        component: () => (
          <Suspense fallback={null}>
            <DynamicCk3 save={savegame} />
          </Suspense>
        ),
      } as const;
    case "vic3":
      return {
        kind: "in-screen",
        component: () => (
          <Suspense fallback={null}>
            <DynamicVic3 save={savegame.data} />
          </Suspense>
        ),
      } as const;
    case "hoi4":
      return {
        kind: "in-screen",
        component: () => (
          <Suspense fallback={null}>
            <DynamicHoi4 save={savegame} />
          </Suspense>
        ),
      } as const;
    case "imperator":
      return {
        kind: "in-screen",
        component: () => (
          <Suspense fallback={null}>
            <DynamicImperator save={savegame} />
          </Suspense>
        ),
      } as const;
  }
};

const FullscreenPage = ({ children }: React.PropsWithChildren) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden");
    return () => {
      document.body.classList.toggle("overflow-hidden");
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`fixed inset-0 z-200 bg-white dark:bg-slate-900 ${classes["slide-in"]}`}
    >
      {children}
    </div>
  );
};

type GameViewProps = {
  children?: React.ReactNode;
};

export const GameView = ({ children }: GameViewProps) => {
  const savegame = useSaveFileInput();
  const { resetSaveAnalysis } = useEngineActions();
  const game = useMemo(() => gameRenderer(savegame), [savegame]);
  useEffect(() => resetSaveAnalysis, [resetSaveAnalysis]);
  useWindowMessageDrop();

  return (
    <>
      {children ? (
        <WebPage inert={game?.kind === "full-screen"}>
          {game === null || game.kind === "full-screen" ? children : null}
          {game?.kind === "in-screen" ? game.component() : null}
        </WebPage>
      ) : null}
      {game?.kind === "full-screen" ? (
        <FullscreenPage>{game.component()}</FullscreenPage>
      ) : null}
      <PageDropOverlay />
    </>
  );
};

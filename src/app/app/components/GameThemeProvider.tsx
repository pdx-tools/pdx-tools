import React from "react";

export type GameTheme = "eu5";

type GameThemeContextValue = {
  theme: GameTheme;
  container: HTMLDivElement | null;
};

const GameThemeContext = React.createContext<GameThemeContextValue | null>(null);

export const GameThemeProvider = ({
  theme,
  children,
}: {
  theme: GameTheme;
  children: React.ReactNode;
}) => {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);

  return (
    <GameThemeContext.Provider value={{ theme, container }}>
      <div ref={setContainer} data-game-theme={theme} className="contents">
        {children}
      </div>
    </GameThemeContext.Provider>
  );
};

export const useGameTheme = () => React.useContext(GameThemeContext);

export const useGameThemeContainer = () => {
  return React.useContext(GameThemeContext)?.container ?? null;
};

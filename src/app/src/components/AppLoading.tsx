import { AppSvg } from "./icons";

export const AppLoading: React.FC<{}> = () => {
  return (
    <div
      className="flex-col items-center justify-center"
      style={{ height: "100%" }}
    >
      <AppSvg width="10rem" height="10rem" style={{ fill: "black" }} />
      <p className="text-xl">Loading . . .</p>
    </div>
  );
};

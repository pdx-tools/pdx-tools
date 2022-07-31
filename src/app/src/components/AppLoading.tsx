import { AppSvg } from "./icons";

export const AppLoading = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <AppSvg width="10rem" height="10rem" style={{ fill: "black" }} />
      <p className="text-xl">Loading . . .</p>
    </div>
  );
};

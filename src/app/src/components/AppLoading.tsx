import { AppSvg } from "./icons";

export const AppLoading = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <AppSvg width="250" className="invert" />
      <p className="text-xl">Loading . . .</p>
    </div>
  );
};

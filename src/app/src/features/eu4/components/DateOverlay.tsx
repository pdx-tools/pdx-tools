import { useSelector } from "react-redux";
import { selectEu4MapDate } from "../eu4Slice";

export const DateOverlay = () => {
  const mapDate = useSelector(selectEu4MapDate);
  return (
    <div className="fixed right-[60px] flex h-[60px] touch-none items-center border-2 border-solid border-black bg-gray-800 px-4 text-xl font-bold text-white">
      {mapDate.text}
    </div>
  );
};

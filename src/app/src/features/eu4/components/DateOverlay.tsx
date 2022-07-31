import { useSelector } from "react-redux";
import { selectEu4MapDate } from "../eu4Slice";

export const DateOverlay = () => {
  const mapDate = useSelector(selectEu4MapDate);
  return (
    <div className="right-[60px] h-[60px] px-4 fixed flex items-center font-bold text-xl text-white bg-gray-800 border-black border-2 border-solid touch-none">
      {mapDate.text}
    </div>
  );
};

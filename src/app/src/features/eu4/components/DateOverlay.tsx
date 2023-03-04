import { useSelectedDate } from "../store";

export const DateOverlay = () => {
  const mapDate = useSelectedDate();
  return (
    <div className="fixed right-[60px] flex h-[60px] touch-none items-center border-2 border-solid border-black bg-gray-800 px-4 text-xl font-bold text-white">
      {mapDate.text}
    </div>
  );
};

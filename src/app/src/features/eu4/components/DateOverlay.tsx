import { useSelector } from "react-redux";
import { selectEu4MapDate } from "../eu4Slice";

export const DateOverlay = () => {
  const mapDate = useSelector(selectEu4MapDate);
  return (
    <div className="date-overlay touch-none">
      {mapDate.text}

      <style jsx>{`
        .date-overlay {
          position: fixed;
          right: 60px;
          height: 60px;
          display: flex;

          // This is the background color in EU4 date
          background-color: #20272c;
          place-items: center;
          color: white;
          padding-left: 1rem;
          padding-right: 1rem;
          font-size: 1.25rem;
          box-shadow: inset 0 0 30px #333;
          font-weight: bold;
          border: 2px solid black;
        }
      `}</style>
    </div>
  );
};

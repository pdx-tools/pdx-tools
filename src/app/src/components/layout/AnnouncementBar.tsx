export const AnnouncementBar: React.FC<{}> = ({ children }) => {
  return (
    <div className="flex-row justify-center font-bold">
      <style jsx>{`
        div {
          background-color: #207dd4;
          color: white;
          padding: 0.25rem 0;
        }
      `}</style>
      {children}
    </div>
  );
};

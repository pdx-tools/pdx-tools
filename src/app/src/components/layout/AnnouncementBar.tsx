interface AnnouncementBarProps {
  children: React.ReactNode;
}

export const AnnouncementBar = ({ children }: AnnouncementBarProps) => {
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

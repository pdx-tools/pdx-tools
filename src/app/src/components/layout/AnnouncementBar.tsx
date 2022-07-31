interface AnnouncementBarProps {
  children: React.ReactNode;
}

export const AnnouncementBar = ({ children }: AnnouncementBarProps) => {
  return (
    <div className="flex items-center justify-center font-bold text-white py-1 px-0 bg-sky-600">
      {children}
    </div>
  );
};

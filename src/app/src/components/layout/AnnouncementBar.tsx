interface AnnouncementBarProps {
  children: React.ReactNode;
}

export const AnnouncementBar = ({ children }: AnnouncementBarProps) => {
  return (
    <div className="flex items-center justify-center bg-sky-600 py-1 px-0 text-white">
      {children}
    </div>
  );
};

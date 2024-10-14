interface AnnouncementBarProps {
  children: React.ReactNode;
}

export const AnnouncementBar = ({ children }: AnnouncementBarProps) => {
  return (
    <div className="flex items-center justify-center bg-sky-600 px-0 py-1 text-white">
      {children}
    </div>
  );
};

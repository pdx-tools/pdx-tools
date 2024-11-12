import { Toaster as Sonner } from "sonner";

export type ToasterProps = React.ComponentProps<typeof Sonner>;

export const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          error: "bg-rose-200 border-rose-300",
          success: "bg-green-200 border-green-300",
          warning: "bg-amber-100 border-amber-200",
          info: "bg-sky-200 border-sky-300",
          toast: "group toast group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-gray-700",
          closeButton: "group-[.toast]:bg-white",
          cancelButton: "group-[.toast]:bg-white",
        },
      }}
      {...props}
    />
  );
};

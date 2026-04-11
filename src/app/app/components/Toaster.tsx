import { Toaster as Sonner } from "sonner";

export type ToasterProps = React.ComponentProps<typeof Sonner>;

export const Toaster = (props: ToasterProps) => {
  return <Sonner {...props} />;
};

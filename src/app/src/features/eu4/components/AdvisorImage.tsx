import React from "react";
import Image from "next/image";

export const AdvisorImage = React.forwardRef<
  React.ElementRef<typeof Image>,
  Omit<React.ComponentPropsWithoutRef<typeof Image>, "src"> & {
    id: string;
    alt: string;
  }
>(function AdvisorImage({ id, alt, ...props }, ref) {
  try {
    const src: string = require(`@/images/eu4/advisors/${id}.png`);
    return (
      <Image ref={ref} {...props} src={src} width={77} height={77} alt={alt} />
    );
  } catch {
    return null;
  }
});

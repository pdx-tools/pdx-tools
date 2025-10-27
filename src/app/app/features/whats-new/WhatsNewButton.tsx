import React, { useState } from "react";
import { Button } from "@/components/Button";
import type { ButtonProps } from "@/components/Button";
import { useWhatsNew } from "./useWhatsNew";
import { emitEvent } from "@/lib/events";
import { useWhatsNewActions } from "./whatsNewStore";

type WhatsNewButtonProps = {
  isLink?: boolean;
};

export const WhatsNewButton = React.forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement> & ButtonProps & WhatsNewButtonProps
>(function WhatsNewButton({ onClick, isLink, ...props }, ref) {
  const { latestRelease } = useWhatsNew();
  const { markLatestSeen } = useWhatsNewActions();
  const [hasClicked, setHasClicked] = useState(false);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    emitEvent({
      kind: "Whats new clicked",
      source: "button",
    });
    if (latestRelease?.release_date) {
      markLatestSeen(latestRelease.release_date);
    }
    onClick?.(e);
    setHasClicked(true);
  };

  return (
    <Button
      ref={ref}
      variant="ghost"
      shape="none"
      className="relative px-3 py-1.5 text-sm font-medium text-white hover:text-white focus-visible:text-white"
      asChild={isLink}
      onClick={handleClick}
      {...props}
    >
      {isLink ? (
        <a href="/changelog">
          <WhatsNewBody />
        </a>
      ) : (
        <WhatsNewBody hasClicked={hasClicked} />
      )}
    </Button>
  );
});

function WhatsNewBody({ hasClicked }: { hasClicked?: boolean }) {
  const { hasUnread } = useWhatsNew();
  return (
    <>
      <span className="relative inline-flex items-center">
        What&apos;s New
        {hasUnread && !hasClicked ? (
          <span className="absolute -top-1 -right-2 inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </span>
      {hasUnread ? (
        <span className="sr-only">New updates available</span>
      ) : null}
    </>
  );
}

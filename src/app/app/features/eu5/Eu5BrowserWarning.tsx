import { useState, useEffect } from "react";
import { isChromiumBased } from "@/lib/browserDetection";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { ChromeIcon } from "@/components/icons/ChromeIcon";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

export const Eu5BrowserWarning = () => {
  const [isChromium, setIsChromium] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setIsChromium(isChromiumBased());
  }, []);

  // Don't show warning if browser is Chromium-based
  if (isChromium) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Warning Icon Button - Fixed position in top-left */}
      <div className="fixed top-0 left-0 z-50">
        <Dialog.Trigger asChild>
          <Button
            shape="circle"
            variant="ghost"
            className="m-2 border-2 border-amber-400 bg-amber-100 text-amber-800 shadow-md transition-all hover:scale-105 hover:bg-amber-100 hover:shadow-lg"
            aria-label="Show browser warning"
          >
            <ExclamationTriangleIcon className="h-6 w-6" />
          </Button>
        </Dialog.Trigger>
      </div>

      {/* Modal Dialog Content */}
      <Dialog.Content className="max-w-md">
        <Dialog.Header>
          <Dialog.Title className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <ExclamationTriangleIcon className="h-6 w-6" />
            Browser Compatibility Notice
          </Dialog.Title>
        </Dialog.Header>

        <div className="space-y-4 py-4">
          <Dialog.Description className="text-base">
            WebGPU support is currently best in Chromium-based browsers, though
            compatibility also depends on your operating system.
          </Dialog.Description>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <div className="text-sm">
              <h2 className="font-semibold text-amber-900 dark:text-amber-100">
                Performance Notice:
              </h2>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                Your current browser may experience reduced performance with
                WebGPU rendering, which can result in slower map rendering,
                stuttering, or visual glitches.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
            <div className="flex items-start gap-3">
              <ChromeIcon className="h-8 w-8 flex-shrink-0 text-blue-600" />
              <div className="text-sm">
                <h2 className="font-semibold text-green-900 dark:text-green-100">
                  Browsers with Better WebGPU Support:
                </h2>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-green-800 dark:text-green-200">
                  <li>Google Chrome</li>
                  <li>Microsoft Edge</li>
                  <li>Brave</li>
                  <li>Opera</li>
                  <li>Any Chromium-based browser</li>
                </ul>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Note: WebGPU also requires hardware acceleration enabled in browser
            settings. You can continue using your current browser, but you may
            experience reduced performance.
          </p>
        </div>

        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button>Ok</Button>
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
};

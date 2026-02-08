import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Collapsible } from "@/components/Collapsible";
import type { ScanError } from "../lib/tauri";

interface ScanErrorDialogProps {
  errors: ScanError[];
}

export default function ScanErrorDialog({ errors }: ScanErrorDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (errors.length === 0) {
    return null;
  }

  return (
    <>
      {/* Toast-style slide-in alert */}
      <div className="animate-slideIn fixed right-6 bottom-6 z-50">
        <div className="relative">
          {/* Pulsing border animation */}
          <div className="absolute inset-0 animate-pulse rounded-xl bg-gradient-to-r from-rose-900/90 to-rose-800/90 blur-sm" />
          <Alert
            variant="error"
            className="relative cursor-pointer border-2 border-rose-500/50 bg-gradient-to-r from-rose-900/90 to-rose-800/90 p-4 shadow-2xl shadow-rose-500/30 backdrop-blur-lg transition-all duration-300 hover:scale-105 hover:shadow-rose-500/50"
            onClick={() => setIsOpen(true)}
          >
            <div className="flex items-center gap-3">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="font-bold text-white">
                {errors.length} error{errors.length !== 1 ? "s" : ""} occurred
              </span>
            </div>
          </Alert>
        </div>
      </div>

      {/* Modal with backdrop blur */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Content
          title="Scan Errors"
          className="max-w-2xl bg-slate-900/70 backdrop-blur-md"
        >
          <div className="space-y-4">
            <p className="text-base text-slate-300">
              The following errors occurred while scanning save files:
            </p>

            <div className="max-h-[400px] space-y-3 overflow-y-auto pr-2">
              {errors.map((error, index) => (
                <Collapsible key={index}>
                  <Collapsible.Trigger className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur transition-all duration-200 hover:border-rose-500/50 hover:bg-slate-800/70">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-400 transition-transform group-hover:scale-110"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-slate-200 transition-colors group-hover:text-white">
                        {error.filePath || "Unknown file"}
                      </p>
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div className="mt-2 ml-8 rounded-lg border-2 border-rose-500/20 bg-slate-900/70 p-4">
                      <p className="font-mono text-sm whitespace-pre-wrap text-rose-200">
                        {error.error}
                      </p>
                    </div>
                  </Collapsible.Content>
                </Collapsible>
              ))}
            </div>

            <div className="flex justify-end border-t border-slate-700/50 pt-4">
              <Button
                onClick={() => setIsOpen(false)}
                className="border border-amber-500/50 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400"
              >
                Close
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

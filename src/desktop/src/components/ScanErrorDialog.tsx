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
      <div className="fixed bottom-6 right-6 z-50 animate-slideIn">
        <div className="relative">
          {/* Pulsing border animation */}
          <div className="absolute inset-0 bg-gradient-to-r from-rose-900/90 to-rose-800/90 rounded-xl blur-sm animate-pulse" />
          <Alert
            variant="error"
            className="relative cursor-pointer bg-gradient-to-r from-rose-900/90 to-rose-800/90 backdrop-blur-lg border-2 border-rose-500/50 shadow-2xl shadow-rose-500/30 hover:shadow-rose-500/50 hover:scale-105 transition-all duration-300"
            onClick={() => setIsOpen(true)}
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6"
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
        <Dialog.Content title="Scan Errors" className="max-w-2xl backdrop-blur-md bg-slate-900/95">
          <div className="space-y-4">
            <p className="text-base text-slate-300">
              The following errors occurred while scanning save files:
            </p>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {errors.map((error, index) => (
                <Collapsible key={index}>
                  <Collapsible.Trigger className="flex items-start gap-3 p-4 bg-slate-800/50 backdrop-blur rounded-lg border-2 border-slate-700/50 hover:border-rose-500/50 hover:bg-slate-800/70 transition-all duration-200 cursor-pointer w-full group">
                    <svg
                      className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform"
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
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-slate-200 truncate group-hover:text-white transition-colors">
                        {error.filePath || "Unknown file"}
                      </p>
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div className="p-4 bg-slate-900/70 border-2 border-rose-500/20 rounded-lg mt-2 ml-8">
                      <p className="text-sm text-rose-200 font-mono whitespace-pre-wrap">
                        {error.error}
                      </p>
                    </div>
                  </Collapsible.Content>
                </Collapsible>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-700/50">
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 border border-amber-500/50"
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

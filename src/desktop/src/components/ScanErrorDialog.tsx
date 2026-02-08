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
      <div className="fixed bottom-6 right-6 z-50">
        <Alert variant="error" className="cursor-pointer" onClick={() => setIsOpen(true)}>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
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
            <span className="font-semibold">
              {errors.length} error{errors.length !== 1 ? "s" : ""} occurred
            </span>
          </div>
        </Alert>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Content title="Scan Errors" className="max-w-2xl">
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              The following errors occurred while scanning save files:
            </p>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {errors.map((error, index) => (
                <Collapsible key={index}>
                  <Collapsible.Trigger className="flex items-start gap-2 p-3 bg-slate-800 rounded border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer w-full">
                    <svg
                      className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
                      <p className="font-mono text-xs text-slate-300 truncate">
                        {error.filePath || "Unknown file"}
                      </p>
                    </div>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div className="p-3 bg-slate-900/50 border border-slate-700 rounded mt-1">
                      <p className="text-sm text-red-300 font-mono whitespace-pre-wrap">
                        {error.error}
                      </p>
                    </div>
                  </Collapsible.Content>
                </Collapsible>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-700">
              <Button onClick={() => setIsOpen(false)}>Close</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

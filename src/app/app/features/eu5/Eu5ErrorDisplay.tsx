import { getErrorMessage } from "@/lib/getErrorMessage";
import { ErrorDisplay } from "@/features/errors";

interface Eu5ErrorDisplayProps {
  error: unknown;
}

function isWebGPUError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("webgpu");
}

export const Eu5ErrorDisplay = ({ error }: Eu5ErrorDisplayProps) => {
  const isWebGPU = isWebGPUError(error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <ErrorDisplay
        title={isWebGPU ? "WebGPU Not Supported" : "Error"}
        message={
          isWebGPU ? (
            <div>
              <p className="mb-3">
                WebGPU could not be initialized. This may be due to your browser
                or operating system.
              </p>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  Try These Steps:
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-blue-800 dark:text-blue-200">
                  <li>
                    Ensure hardware acceleration is enabled in browser settings
                  </li>
                  <li>Try a Chromium-based browser (Chrome, Edge, Brave)</li>
                </ul>
              </div>
            </div>
          ) : undefined
        }
        error={error}
        className="mx-4 w-full max-w-md"
      />
    </div>
  );
};

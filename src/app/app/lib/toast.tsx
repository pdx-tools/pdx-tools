import { toast as sonnerToast } from "sonner";
import { cx } from "class-variance-authority";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ToastProps {
  id: string | number;
  type: "success" | "error";
  title: string;
  description?: string;
  closeButton?: boolean;
}

function Toast({ id, type, title, description, closeButton }: ToastProps) {
  return (
    <div
      className={cx(
        "flex w-full items-start gap-3 rounded-lg border-2 border-solid p-4 shadow-lg",
        type === "success" && "border-green-200 bg-green-100",
        type === "error" && "border-rose-200 bg-rose-100",
      )}
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description && <p className="mt-1 text-sm text-gray-700">{description}</p>}
      </div>
      {closeButton && (
        <button
          type="button"
          className="cursor-pointer border-none bg-transparent p-0 text-gray-500 hover:text-gray-700"
          aria-label="Close"
          onClick={() => sonnerToast.dismiss(id)}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export const toast = {
  success(title: string, opts?: { duration?: number }) {
    return sonnerToast.custom((id) => <Toast id={id} type="success" title={title} />, {
      duration: opts?.duration ?? 4000,
    });
  },
  error(title: string, opts?: { description?: string; duration?: number; closeButton?: boolean }) {
    return sonnerToast.custom(
      (id) => (
        <Toast
          id={id}
          type="error"
          title={title}
          description={opts?.description}
          closeButton={opts?.closeButton}
        />
      ),
      { duration: opts?.duration ?? 4000 },
    );
  },
};

import React from "react";
import { cx } from "class-variance-authority";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/Button";
import { Collapsible } from "@/components/Collapsible";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { Link } from "@/components/Link";
import { DiscordIcon, GithubIcon } from "@/components/icons";
import { AppSvg } from "@/components/icons/AppIcon";
import { useEngineActions } from "../engine";
import { Card } from "@/components/Card";

type ErrorDisplayProps = {
  title: string;
  message?: React.ReactNode;
  error: unknown;
  details?: React.ReactNode;
  suggestions?: Array<React.ReactNode>;
  onReset?: () => void;
  resetLabel?: string;
  eventId?: string | null;
  className?: string;
};

const SUPPORT_LINKS = [
  {
    href: "https://discord.gg/rCpNWQW",
    label: "Join Discord",
    icon: DiscordIcon,
  },
  {
    href: "https://github.com/pdx-tools/pdx-tools/issues/new",
    label: "Open GitHub issue",
    icon: GithubIcon,
  },
];

export const ErrorDisplay = ({
  title,
  message,
  error,
  details,
  onReset,
  resetLabel = "Try again",
  eventId,
  className,
}: ErrorDisplayProps) => {
  const detailContent = details ?? (error ? getErrorMessage(error) : null);
  const { resetSaveAnalysis } = useEngineActions();

  return (
    <Card
      className={cx(
        "relative w-full max-w-lg justify-self-center p-6",
        className,
      )}
    >
      <div className="absolute top-4 right-4">
        <Button asChild shape="circle" variant="ghost">
          <Link
            to="/"
            variant="ghost"
            onClick={() => {
              resetSaveAnalysis();
            }}
          >
            <span className="sr-only">Return to home</span>
            <AppSvg
              width={32}
              height={32}
              className="h-8 w-8 invert-100 transition-transform duration-150 hover:scale-110 dark:invert-0"
            />
          </Link>
        </Button>
      </div>
      <div className="mb-4 flex items-start gap-3">
        <ExclamationTriangleIcon className="h-8 w-8 flex-shrink-0 text-rose-600" />
        <div>
          <h2 className="text-xl font-semibold text-rose-800 dark:text-rose-300">
            {title}
          </h2>
          {message && (
            <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
              {message}
            </div>
          )}
        </div>
      </div>

      {detailContent && (
        <Collapsible className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-inner dark:border-slate-700/60 dark:bg-slate-800/50">
          <Collapsible.Trigger className="text-left text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none dark:text-slate-200 dark:hover:text-slate-50 dark:focus-visible:ring-slate-600 dark:focus-visible:ring-offset-slate-900">
            Technical details
          </Collapsible.Trigger>
          <Collapsible.Content className="mt-3 rounded-lg border border-slate-200/70 bg-white/90 text-xs shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
            {typeof detailContent === "string" ? (
              <pre className="max-h-60 overflow-auto p-3 font-mono leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                {detailContent}
              </pre>
            ) : (
              <div className="max-h-60 overflow-auto p-3 text-slate-700 dark:text-slate-200">
                {detailContent}
              </div>
            )}
          </Collapsible.Content>
        </Collapsible>
      )}

      {onReset && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onReset}>
            {resetLabel}
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
        {eventId && (
          <div className="flex flex-wrap items-center gap-2 text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
            <span>Tracking ID</span>
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.7rem] text-gray-700 dark:bg-slate-800 dark:text-gray-100">
              {eventId}
            </code>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {SUPPORT_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1.5">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
};

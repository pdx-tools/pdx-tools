import { useId } from "react";
import { Card } from "@/components/Card";
import { Switch } from "@/components/Switch";
import { LoadingIcon } from "@/components/icons/LoadingIcon";
import { FEATURES, FEATURE_LIST } from "@/lib/auth";
import type { Feature } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { pdxApi } from "@/services/appApi";

/**
 * The admin's view of what a user can do beyond the defaults. One row per
 * feature, one switch each. Lives on the user's page because that is where
 * an admin lands from a request: open the profile, flip the switch.
 */
export function UserFeaturesPanel({ userId }: { userId: string }) {
  const features = pdxApi.admin.useUserFeatures(userId);
  const setFeature = pdxApi.admin.useSetUserFeature(userId);
  const headingId = useId();

  return (
    <Card className="p-5" role="region" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-xl font-medium">
          Features
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Admin only. A change reaches the user within 15 minutes, no new sign-in needed.
        </p>
      </div>

      <ul className="mt-4 divide-y divide-gray-400/40">
        {FEATURE_LIST.map((feature) => (
          <FeatureRow
            key={feature}
            feature={feature}
            granted={features.data?.features.includes(feature)}
            pending={setFeature.isPending && setFeature.variables?.feature === feature}
            loading={features.isPending}
            error={features.error?.message}
            onChange={(enabled) =>
              setFeature.mutate(
                { feature, enabled },
                {
                  onSuccess: () =>
                    toast.success(
                      enabled
                        ? `${FEATURES[feature].name} granted`
                        : `${FEATURES[feature].name} revoked`,
                      { duration: 2000 },
                    ),
                  onError: (e) =>
                    toast.error("Could not change the feature", {
                      description: e.message,
                      duration: 5000,
                    }),
                },
              )
            }
          />
        ))}
      </ul>
    </Card>
  );
}

function FeatureRow({
  feature,
  granted,
  pending,
  loading,
  error,
  onChange,
}: {
  feature: Feature;
  granted: boolean | undefined;
  pending: boolean;
  loading: boolean;
  error: string | undefined;
  onChange: (enabled: boolean) => void;
}) {
  const id = useId();
  const definition = FEATURES[feature];
  return (
    <li className="flex items-center gap-4 py-3">
      <div className="min-w-0 grow">
        <label htmlFor={id} className="block font-medium">
          {definition.name}
          <span className="ml-2 font-mono text-xs font-normal text-gray-500 dark:text-gray-400">
            {feature}
          </span>
        </label>
        <p className="text-sm text-gray-600 dark:text-gray-400">{definition.description}</p>
        {error && (
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
            Could not load features: {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className="w-20 text-right text-sm text-gray-600 tabular-nums dark:text-gray-400"
          aria-live="polite"
        >
          {loading ? (
            <LoadingIcon className="ml-auto h-4 w-4" />
          ) : granted ? (
            "Granted"
          ) : (
            "Not granted"
          )}
        </span>
        <Switch
          id={id}
          checked={granted ?? false}
          disabled={loading || pending || error !== undefined}
          onCheckedChange={onChange}
          aria-label={`${definition.name} for this user`}
        />
      </div>
    </li>
  );
}

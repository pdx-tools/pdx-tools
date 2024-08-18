import React, { Suspense } from "react";
import { useRouter } from "next/router";
import { HtmlHead } from "@/components/head";
import { UserPage } from "@/features/account";
import { Root } from "@/components/layout/Root";
import { WebPage } from "@/components/layout";
import { ErrorBoundary } from "@sentry/nextjs";
import { Alert } from "@/components/Alert";
import { LoadingIcon } from "@/components/icons/LoadingIcon";

export const UserSaves = () => {
  const router = useRouter();
  const { user_id } = router.query;
  if (typeof user_id !== "string" || Array.isArray(user_id)) {
    return null;
  }

  return (
    <Root>
      <HtmlHead>
        <title>User saves - PDX Tools</title>
        <meta
          name="description"
          content={`EU4 Saves uploaded by user${user_id ? `: ${user_id}` : ""}`}
        ></meta>
      </HtmlHead>
      <WebPage>
        <Suspense
          fallback={
            <div className="m-8 flex justify-center">
              <LoadingIcon className="h-8 w-8" />
            </div>
          }
        >
          <ErrorBoundary
            fallback={({ error }) => (
              <div className="m-8">
                <Alert.Error
                  className="px-4 py-2"
                  msg={`Failed to fetch user: ${error}`}
                />
              </div>
            )}
          >
            <UserPage userId={user_id} />
          </ErrorBoundary>
        </Suspense>
      </WebPage>
    </Root>
  );
};

export default UserSaves;

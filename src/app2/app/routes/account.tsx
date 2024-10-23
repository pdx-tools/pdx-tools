import { WebPage } from '@/components/layout/WebPage'
import { LoggedIn } from '@/components/LoggedIn'
import { Account } from '@/features/account'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/account')({
  component: AccountRoute,
  beforeLoad: ({ context: { session, ...rest } }) => {
    if (session.kind === "guest") {
      throw new Error("Not authenticated");
    }

    return {...rest, session};
  }
})

function AccountRoute() {
  const {session} = Route.useRouteContext();
  return (
    <WebPage>
    <LoggedIn session={session}>
      <Account />
    </LoggedIn>
  </WebPage>
  )
}
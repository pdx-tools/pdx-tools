/* prettier-ignore-start */

/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file is auto-generated by TanStack Router

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as LogoutImport } from './routes/logout'
import { Route as AccountImport } from './routes/account'
import { Route as IndexImport } from './routes/index'
import { Route as Eu4IndexImport } from './routes/eu4.index'
import { Route as UsersUserIdImport } from './routes/users.$userId'
import { Route as Eu4AchievementsIndexImport } from './routes/eu4.achievements.index'
import { Route as Eu4SavesSaveIdImport } from './routes/eu4.saves.$saveId'
import { Route as Eu4AchievementsAchievementIdImport } from './routes/eu4.achievements.$achievementId'

// Create/Update Routes

const LogoutRoute = LogoutImport.update({
  id: '/logout',
  path: '/logout',
  getParentRoute: () => rootRoute,
} as any)

const AccountRoute = AccountImport.update({
  id: '/account',
  path: '/account',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const Eu4IndexRoute = Eu4IndexImport.update({
  id: '/eu4/',
  path: '/eu4/',
  getParentRoute: () => rootRoute,
} as any)

const UsersUserIdRoute = UsersUserIdImport.update({
  id: '/users/$userId',
  path: '/users/$userId',
  getParentRoute: () => rootRoute,
} as any)

const Eu4AchievementsIndexRoute = Eu4AchievementsIndexImport.update({
  id: '/eu4/achievements/',
  path: '/eu4/achievements/',
  getParentRoute: () => rootRoute,
} as any)

const Eu4SavesSaveIdRoute = Eu4SavesSaveIdImport.update({
  id: '/eu4/saves/$saveId',
  path: '/eu4/saves/$saveId',
  getParentRoute: () => rootRoute,
} as any)

const Eu4AchievementsAchievementIdRoute =
  Eu4AchievementsAchievementIdImport.update({
    id: '/eu4/achievements/$achievementId',
    path: '/eu4/achievements/$achievementId',
    getParentRoute: () => rootRoute,
  } as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/account': {
      id: '/account'
      path: '/account'
      fullPath: '/account'
      preLoaderRoute: typeof AccountImport
      parentRoute: typeof rootRoute
    }
    '/logout': {
      id: '/logout'
      path: '/logout'
      fullPath: '/logout'
      preLoaderRoute: typeof LogoutImport
      parentRoute: typeof rootRoute
    }
    '/users/$userId': {
      id: '/users/$userId'
      path: '/users/$userId'
      fullPath: '/users/$userId'
      preLoaderRoute: typeof UsersUserIdImport
      parentRoute: typeof rootRoute
    }
    '/eu4/': {
      id: '/eu4/'
      path: '/eu4'
      fullPath: '/eu4'
      preLoaderRoute: typeof Eu4IndexImport
      parentRoute: typeof rootRoute
    }
    '/eu4/achievements/$achievementId': {
      id: '/eu4/achievements/$achievementId'
      path: '/eu4/achievements/$achievementId'
      fullPath: '/eu4/achievements/$achievementId'
      preLoaderRoute: typeof Eu4AchievementsAchievementIdImport
      parentRoute: typeof rootRoute
    }
    '/eu4/saves/$saveId': {
      id: '/eu4/saves/$saveId'
      path: '/eu4/saves/$saveId'
      fullPath: '/eu4/saves/$saveId'
      preLoaderRoute: typeof Eu4SavesSaveIdImport
      parentRoute: typeof rootRoute
    }
    '/eu4/achievements/': {
      id: '/eu4/achievements/'
      path: '/eu4/achievements'
      fullPath: '/eu4/achievements'
      preLoaderRoute: typeof Eu4AchievementsIndexImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/account': typeof AccountRoute
  '/logout': typeof LogoutRoute
  '/users/$userId': typeof UsersUserIdRoute
  '/eu4': typeof Eu4IndexRoute
  '/eu4/achievements/$achievementId': typeof Eu4AchievementsAchievementIdRoute
  '/eu4/saves/$saveId': typeof Eu4SavesSaveIdRoute
  '/eu4/achievements': typeof Eu4AchievementsIndexRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/account': typeof AccountRoute
  '/logout': typeof LogoutRoute
  '/users/$userId': typeof UsersUserIdRoute
  '/eu4': typeof Eu4IndexRoute
  '/eu4/achievements/$achievementId': typeof Eu4AchievementsAchievementIdRoute
  '/eu4/saves/$saveId': typeof Eu4SavesSaveIdRoute
  '/eu4/achievements': typeof Eu4AchievementsIndexRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/account': typeof AccountRoute
  '/logout': typeof LogoutRoute
  '/users/$userId': typeof UsersUserIdRoute
  '/eu4/': typeof Eu4IndexRoute
  '/eu4/achievements/$achievementId': typeof Eu4AchievementsAchievementIdRoute
  '/eu4/saves/$saveId': typeof Eu4SavesSaveIdRoute
  '/eu4/achievements/': typeof Eu4AchievementsIndexRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/account'
    | '/logout'
    | '/users/$userId'
    | '/eu4'
    | '/eu4/achievements/$achievementId'
    | '/eu4/saves/$saveId'
    | '/eu4/achievements'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/account'
    | '/logout'
    | '/users/$userId'
    | '/eu4'
    | '/eu4/achievements/$achievementId'
    | '/eu4/saves/$saveId'
    | '/eu4/achievements'
  id:
    | '__root__'
    | '/'
    | '/account'
    | '/logout'
    | '/users/$userId'
    | '/eu4/'
    | '/eu4/achievements/$achievementId'
    | '/eu4/saves/$saveId'
    | '/eu4/achievements/'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AccountRoute: typeof AccountRoute
  LogoutRoute: typeof LogoutRoute
  UsersUserIdRoute: typeof UsersUserIdRoute
  Eu4IndexRoute: typeof Eu4IndexRoute
  Eu4AchievementsAchievementIdRoute: typeof Eu4AchievementsAchievementIdRoute
  Eu4SavesSaveIdRoute: typeof Eu4SavesSaveIdRoute
  Eu4AchievementsIndexRoute: typeof Eu4AchievementsIndexRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AccountRoute: AccountRoute,
  LogoutRoute: LogoutRoute,
  UsersUserIdRoute: UsersUserIdRoute,
  Eu4IndexRoute: Eu4IndexRoute,
  Eu4AchievementsAchievementIdRoute: Eu4AchievementsAchievementIdRoute,
  Eu4SavesSaveIdRoute: Eu4SavesSaveIdRoute,
  Eu4AchievementsIndexRoute: Eu4AchievementsIndexRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* prettier-ignore-end */

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/account",
        "/logout",
        "/users/$userId",
        "/eu4/",
        "/eu4/achievements/$achievementId",
        "/eu4/saves/$saveId",
        "/eu4/achievements/"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/account": {
      "filePath": "account.tsx"
    },
    "/logout": {
      "filePath": "logout.tsx"
    },
    "/users/$userId": {
      "filePath": "users.$userId.tsx"
    },
    "/eu4/": {
      "filePath": "eu4.index.tsx"
    },
    "/eu4/achievements/$achievementId": {
      "filePath": "eu4.achievements.$achievementId.tsx"
    },
    "/eu4/saves/$saveId": {
      "filePath": "eu4.saves.$saveId.tsx"
    },
    "/eu4/achievements/": {
      "filePath": "eu4.achievements.index.tsx"
    }
  }
}
ROUTE_MANIFEST_END */

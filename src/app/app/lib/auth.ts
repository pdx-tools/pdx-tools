// Attribute-based access control
import { type PdxSession } from "@/server-lib/auth/session";

declare const tag: unique symbol;
export type UserId = string & {
  readonly [tag]: UserId;
};

export function userId(x: string) {
  return x as UserId;
}

export type Role = "admin" | "user" | "guest";
export type User = { roles: Role[]; id?: UserId };
export type LoggedInUser = { roles: Role[]; id: UserId };

type PdxPermissions =
  | {
      kind: "savefile:create";
    }
  | {
      kind: "savefile:delete";
      data: { userId?: UserId };
    }
  | {
      kind: "savefile:update";
      data: { userId?: UserId };
    }
  | {
      kind: "savefile:reprocess";
    }
  | {
      kind: "savefile:og-request";
    }
  | {
      kind: "leaderboard:rebalance";
    };

type PermissionFunction<K> = K extends { data: infer D }
  ? (user: User, data?: D) => boolean
  : (user: User) => boolean;
type PermissionData<K> = K extends { data: infer D } ? D : undefined;

type RolePermissions = {
  [K in PdxPermissions as K["kind"]]: boolean | PermissionFunction<K>;
};

type RolePermissionsMapping = {
  [R in Role]: Partial<RolePermissions>;
};

const ROLES: RolePermissionsMapping = {
  admin: {
    "savefile:create": true,
    "savefile:delete": true,
    "savefile:update": true,
    "savefile:reprocess": true,
    "leaderboard:rebalance": true,
    "savefile:og-request": true,
  },
  user: {
    "savefile:create": true,
    "savefile:delete": (user, data) => data?.userId === user.id,
    "savefile:update": (user, data) => data?.userId === user.id,
  },
  guest: {},
};

type DataAttributes<P extends PdxPermissions["kind"]> = PermissionData<
  Extract<PdxPermissions, { kind: P }>
>;

export function hasPermission<P extends PdxPermissions["kind"]>(
  user: User,
  operation: P,
  data?: DataAttributes<P>,
) {
  for (const role of user.roles) {
    const permission = ROLES[role][operation];
    if (typeof permission === "boolean" && permission) {
      return true;
    } else if (typeof permission === "function") {
      // Unsure how to make this perfectly type-safe
      type TempPerm = (user: User, data?: unknown) => boolean;
      if ((permission as TempPerm)(user, data)) {
        return true;
      }
    }
  }

  return false;
}

export class AuthorizationError extends Error {
  constructor() {
    super("forbidden from performing action");
    this.name = "AuthorizationError";
  }
}

export function ensurePermissions<P extends PdxPermissions["kind"]>(
  user: User,
  operation: P,
  data?: DataAttributes<P>,
) {
  if (!hasPermission(user, operation, data)) {
    throw new AuthorizationError();
  }
}

export function pdxUser(session: PdxSession): User {
  return session.kind === "guest"
    ? {
        roles: ["guest"],
      }
    : {
        roles: [session.account === "admin" ? "admin" : "user"],
        id: session.userId,
      };
}

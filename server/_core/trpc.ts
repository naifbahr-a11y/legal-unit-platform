import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { hasFullAccess } from '@shared/userRoles';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { GENERIC_INTERNAL_ERROR } from "./sanitizeError";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (ENV.isProduction && error.code === "INTERNAL_SERVER_ERROR") {
      return { ...shape, message: GENERIC_INTERNAL_ERROR };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const PASSWORD_CHANGE_EXEMPT = new Set([
  "auth.changePassword",
  "auth.logout",
]);

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (
    Number((ctx.user as { mustChangePassword?: number }).mustChangePassword) === 1
    && !PASSWORD_CHANGE_EXEMPT.has(path)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "يجب تغيير كلمة المرور أولاً",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !hasFullAccess(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// src/middleware/session.ts
import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";

export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, "session");
  if (!token) {
    return c.redirect("/auth/login");
  }
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    c.set("userId", payload.userId as string);
    await next();
  } catch {
    return c.redirect("/auth/login");
  }
});

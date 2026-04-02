// src/routes/auth.ts
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie } from "hono/cookie";
import { saveUser } from "../services/users";
import type { Env } from "../types";

export const authRoutes = new Hono<Env>();

authRoutes.get("/auth/login", (c) => {
  const redirectUri = new URL("/auth/callback", c.req.url).toString();
  const url = new URL("https://auth.monday.com/oauth2/authorize");
  url.searchParams.set("client_id", c.env.MONDAY_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  return c.redirect(url.toString());
});

authRoutes.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.text("Missing authorization code", 400);
  }

  const redirectUri = new URL("/auth/callback", c.req.url).toString();

  const tokenResponse = await fetch("https://auth.monday.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: c.env.MONDAY_CLIENT_ID,
      client_secret: c.env.MONDAY_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    return c.text("Failed to exchange authorization code", 502);
  }

  const { access_token } = (await tokenResponse.json()) as { access_token: string };

  const meResponse = await fetch("https://api.monday.com/2024-10/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: access_token,
    },
    body: JSON.stringify({ query: "{ me { id name email } }" }),
  });

  if (!meResponse.ok) {
    return c.text("Failed to fetch user info", 502);
  }

  const { data } = (await meResponse.json()) as {
    data: { me: { id: string; name: string; email: string } };
  };
  const user = data.me;

  await saveUser(c.env.KV, user.id, {
    mondayToken: access_token,
    name: user.name,
    email: user.email,
  });

  const exp = Math.floor(Date.now() / 1000) + 86400;
  const jwt = await sign({ userId: user.id, exp }, c.env.JWT_SECRET, "HS256");
  setCookie(c, "session", jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 86400,
  });

  return c.redirect("/dashboard");
});

authRoutes.get("/auth/logout", (c) => {
  setCookie(c, "session", "", { path: "/", maxAge: 0 });
  return c.redirect("/auth/login");
});

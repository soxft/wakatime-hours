import { makeBadge } from "npm:badge-maker";
import type { Format } from "npm:badge-maker";
import { Buffer } from "node:buffer";
import { load } from "https://deno.land/std@0.182.0/dotenv/mod.ts";
import LRU from "https://esm.sh/lru-cache@8.0.4";

type BadgeProps = {
 label?: string;
 labelColor?: string;
 color?: string;
 style?: string;
};

const env = await load();
const port = parseInt(env["PORT"]) || 8080;
const server = Deno.listen({ port: port });

const cache = new LRU({
 max: 1,
 ttl: 1000 * 60 * 60, // 1 hour
});

console.log(`HTTP webserver running.  Access it at:  http://localhost:${port}/`);

if (!env["WAKATIME_API_KEY"]) throw new Error("WAKATIME_API_KEY is not defined in .env file.");
const token = Buffer.from(env["WAKATIME_API_KEY"]).toString("base64");

for await (const conn of server) {
 serveHttp(conn).catch(console.error) as Promise<void>;
}

async function serveHttp(conn: Deno.Conn) {
 const httpConn = Deno.serveHttp(conn) as Deno.HttpConn;

 for await (const requestEvent of httpConn) {
  if (requestEvent.request.method !== "GET") {
   requestEvent.respondWith(new Response("Invaild method!", { status: 405 }));
   continue;
  }

  const url = new URL(requestEvent.request.url) as URL;
  const path = url.pathname as string;

  if (path !== "/api/badge") {
   requestEvent.respondWith(
    new Response("Redirecting...", {
     status: 302,
     headers: {
      Location: "/api/badge",
     },
    }),
   );
   continue;
  }

  const { label, labelColor, color, style } = Object.fromEntries(new URLSearchParams(url.search)) as BadgeProps;

  if (cache.has("data")) {
   const badge = makeBadge({
    label: label || "Wakatime",
    message: cache.get("data") as string,
    color: color || "blue",
    labelColor: labelColor || "grey",
    style: style || "flat",
   } as Format);

   requestEvent.respondWith(
    new Response(badge, {
     status: 200,
     headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      "Vary": "Accept-Encoding",
      "x-server-cache": "HIT",
     },
    }),
   );
   continue;
  }

  const response = await fetch("https://wakatime.com/api/v1/users/current/all_time_since_today", {
   method: "GET",
   headers: {
    Authorization: `Basic ${token}`,
   },
  });

  if (!response.ok) {
   requestEvent.respondWith(new Response("Internal server error!", { status: 500 }));
   continue;
  }

  const data = await response.json();

  cache.set("data", data.data?.text || "Getting data...");

  const badge = makeBadge({
   label: label || "Wakatime",
   message: data.data?.text || "Getting data...",
   color: color || "blue",
   labelColor: labelColor || "grey",
   style: style || "flat",
  } as Format);

  requestEvent.respondWith(
   new Response(badge, {
    status: 200,
    headers: {
     "Content-Type": "image/svg+xml",
     "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
     "Vary": "Accept-Encoding",
     "x-server-cache": "MISS",
    },
   }),
  );
 }
}

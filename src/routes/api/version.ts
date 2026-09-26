import { createFileRoute } from "@tanstack/react-router";

const id = import.meta.env.VITE_BUILD_ID || "dev";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ id }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});

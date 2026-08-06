import { createFileRoute } from "@tanstack/react-router";

/**
 * EAS project id for AddisFurnish (mobile/app.json → extra.eas.projectId).
 */
const EXPO_APP_ID = "838504d6-b211-4e5c-9df7-145b3ece145e";

const EXPO_ACCOUNT = "hayredins-team";
const EXPO_PROJECT = "addisfurnish";

/**
 * Build id of the newest finished APK at the time this was written. Used as
 * the fallback when EXPO_TOKEN is not configured or the EAS query fails, so
 * the button never dead-ends. Refresh it by running:
 *   eas build:list --platform android --limit 1
 *
 * This is deliberately a build *page* URL, not an artifact URL: EAS deletes
 * build artifacts after ~30 days, so an artifact link would 404 within a
 * month. The build page never expires and always offers the download.
 */
const FALLBACK_BUILD_ID = "039be209-eac2-4556-9d22-dd6b23cdb51d";

function buildPageUrl(id: string) {
  return `https://expo.dev/accounts/${EXPO_ACCOUNT}/projects/${EXPO_PROJECT}/builds/${id}`;
}

/**
 * Resolves the newest finished Android build's id through the EAS GraphQL
 * API. Requires an Expo access token (expo.dev → Settings → Access tokens)
 * exported as EXPO_TOKEN — without it we fall back to the pinned build above.
 * Any failure also falls back, never errors out.
 */
async function resolveLatestBuildId(): Promise<string> {
  const token = process.env["EXPO_TOKEN"];
  if (!token) return FALLBACK_BUILD_ID;

  try {
    const res = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `query ViewBuildsOnApp($appId: String!, $offset: Int!, $limit: Int!) {
          app {
            byId(appId: $appId) {
              id
              builds(offset: $offset, limit: $limit) {
                id
                status
                platform
                createdAt
                artifacts { applicationArchiveUrl }
              }
            }
          }
        }`,
        variables: { appId: EXPO_APP_ID, offset: 0, limit: 10 },
      }),
      // A hung EAS call must not stall the redirect forever.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return FALLBACK_BUILD_ID;

    const data: unknown = await res.json();
    const builds =
      (data as { data?: { app?: { byId?: { builds?: BuildLike[] } } } })?.data?.app?.byId?.builds ??
      [];
    const latest = builds
      .filter((b) => b.status === "FINISHED" && b.platform === "ANDROID")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    return latest?.id ?? FALLBACK_BUILD_ID;
  } catch {
    return FALLBACK_BUILD_ID;
  }
}

type BuildLike = {
  id: string;
  status: string;
  platform: string;
  createdAt: string;
  artifacts?: { applicationArchiveUrl?: string | null };
};

/**
 * GET /api/latest-apk → 302 to the newest Android build. The banner links
 * here so the download button always points at the current build without any
 * manual configuration when EXPO_TOKEN is set.
 *
 * The target is the build *page* rather than the artifact URL because EAS
 * deletes build artifacts after ~30 days — the page never expires.
 *
 * This is a server route (server.handlers), not a loader: a loader returning
 * a Response gets serialized as loader data, while a handler's Response is
 * returned to the client verbatim — the documented TanStack Start pattern.
 */
export const Route = createFileRoute("/api/latest-apk")({
  server: {
    handlers: {
      GET: async () => {
        const buildId = await resolveLatestBuildId();
        return new Response(null, {
          status: 302,
          headers: { Location: buildPageUrl(buildId), "Cache-Control": "no-store" },
        });
      },
    },
  },
});

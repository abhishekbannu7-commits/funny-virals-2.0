import type { Platform } from "@/lib/creative/types";

export type PublishTarget = {
  platform: Platform;
  label: string;
  mode: "handoff";
  reason: string;
  href?: string;
};

const ORDER: Platform[] = ["instagram", "facebook", "youtube"];

export function publishTargets(platforms: Platform[]): PublishTarget[] {
  return ORDER.filter((platform) => platforms.includes(platform)).map((platform) => {
    if (platform === "youtube") {
      return {
        platform,
        label: "YouTube",
        mode: "handoff",
        reason:
          "YouTube can take an authorized upload. This page has no YouTube sign-in, so the handoff is the official upload page. Orin does not post.",
        href: "https://www.youtube.com/upload",
      };
    }
    if (platform === "facebook") {
      return {
        platform,
        label: "Facebook",
        mode: "handoff",
        reason: "Facebook posting needs a Page authorization that is not connected. The handoff is the official site. Orin does not post.",
        href: "https://www.facebook.com/",
      };
    }
    return {
      platform,
      label: "Instagram",
      mode: "handoff",
      reason:
        "Instagram publishing needs a professional account and Meta review. This page cannot upload the file. The handoff is the Instagram app, after you download the master.",
    };
  });
}

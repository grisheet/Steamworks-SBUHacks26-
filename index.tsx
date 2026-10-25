import { createFileRoute } from "@tanstack/react-router";
import { Steamworks } from "@/components/steam/Steamworks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STEAMWORKS — Build a steam-powered gear machine" },
      { name: "description", content: "Place gears, power them with steam, and control the workshop with your mouse, keyboard or hands." },
      { property: "og:title", content: "STEAMWORKS — Build a steam-powered gear machine" },
      { property: "og:description", content: "A hand-controlled engineering playground about gears, direction and speed ratios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Steamworks,
});

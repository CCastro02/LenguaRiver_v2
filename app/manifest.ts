import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand-assets";

const BG = "#0f0f12";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LenguaRiver",
    short_name: "LenguaRiver",
    description: "Structured language lessons.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BG,
    theme_color: BG,
    categories: ["education"],
    icons: [
      {
        src: BRAND.iconMark,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.iconMark,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.iconMark,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.iconMark,
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

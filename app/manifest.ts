import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Rodis",
    short_name: "ERP Rodis",
    description: "Gestion stock, commandes et FIFO - ERP Rodis",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#0c4a6e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

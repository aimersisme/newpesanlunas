import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PesanLunas",
    short_name: "PesanLunas",
    description: "Pesanan tercatat, tagihan cepat lunas.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#07864f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

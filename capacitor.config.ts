import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "es.orpira.domino3d",
  appName: "Dominó 3D",
  webDir: "dist/client",
  server: { androidScheme: "https" },
};

export default config;

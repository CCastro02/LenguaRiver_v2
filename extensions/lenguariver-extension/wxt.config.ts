import { defineConfig } from "wxt";

// https://wxt.dev/guide/essentials/config.html
export default defineConfig({
  manifest: () => ({
    name: "LenguaRiver",
    description: "Local-first scaffold: highlight text, floating actions, save words.",
    version: "0.1.0",
    permissions: ["storage"],
    action: {
      default_title: "LenguaRiver",
    },
  }),
});

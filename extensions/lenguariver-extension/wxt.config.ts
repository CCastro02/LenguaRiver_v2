import { defineConfig } from "wxt";

// https://wxt.dev/guide/essentials/config.html
export default defineConfig({
  manifest: () => ({
    name: "LenguaRiver",
    description: "Save highlighted words from the web into LenguaRiver for language learning.",
    version: "0.1.0",
    permissions: ["storage"],
    action: {
      default_title: "LenguaRiver",
    },
  }),
});

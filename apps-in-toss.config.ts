import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "secret-five",
  permissions: [],
  navigationBar: { withBackButton: true, withTitle: true, theme: "light" },
  webView: {
    bounces: true,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
    allowsBackForwardNavigationGestures: false,
  },
  webBundleDir: "dist",
});

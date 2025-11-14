import type { NextConfig } from "next";
import path from "path";
import webpack from "webpack";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";

const requiredEnvVars = [
  "HEDERA_NETWORK",
  "NEXT_PUBLIC_MIRROR_NODE_URL",
  "WALLETCONNECT_PROJECT_ID",
  "NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID",
  "NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID",
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.warn(
    "[next.config.ts] Environment variables missing:",
    missingEnvVars.join(", "),
    "\nCheck your .env.local or hosting provider's configuration.",
  );
}

const nodeModulePolyfill = path.resolve(process.cwd(), "polyfills/node-module.js");

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    config.plugins = config.plugins ?? [];
    if (!isServer) {
      config.plugins.push(new NodePolyfillPlugin());
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:module$/, nodeModulePolyfill),
      );

      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        net: false,
        tls: false,
        dns: false,
      };
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        ioredis: false,
      };
    } else {
      config.optimization = config.optimization ?? {};
      config.optimization.concatenateModules = false;
      const externalModules = [
        "@hashgraphonline/standards-sdk",
        "@hashgraphonline/standards-agent-kit",
      ];

      if (typeof config.externals === "undefined") {
        config.externals = externalModules;
      } else if (Array.isArray(config.externals)) {
        config.externals.push(...externalModules);
      } else if (typeof config.externals === "function") {
        config.externals = [config.externals, ...externalModules];
      }
    }
    return config;
  },
};

export default nextConfig;

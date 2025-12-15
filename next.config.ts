import { resolve } from 'node:path';
import webpack from 'webpack';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import type { NextConfig } from 'next';

const outputFileTracingRoot = resolve(__dirname, '..');
const serverExternalPackages = [
  '@hashgraph/sdk',
  '@hashgraphonline/standards-sdk',
  'pino',
  'thread-stream',
];
const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot,
  compress: true,
  reactStrictMode: true,
  serverExternalPackages,
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      tap: false,
      'thread-stream/test': false,
      'thread-stream/test/string-limit-2.test.js': false,
      'node:buffer': 'buffer',
      'node:crypto': 'crypto-browserify',
      'node:path': 'path-browserify',
      crypto: 'crypto-browserify',
      path: 'path-browserify',
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      buffer: require.resolve('buffer'),
      crypto: require.resolve('crypto-browserify'),
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util'),
      assert: require.resolve('assert'),
      os: require.resolve('os-browserify/browser'),
    };
    config.resolve.extensions = [
      '.ts',
      '.tsx',
      '.mjs',
      '.js',
      '.jsx',
      '.json',
      '.wasm',
    ];
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: ['process'],
      }),
      new NodePolyfillPlugin(),
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, '');
      })
    );
    return config;
  },
  transpilePackages: ['@hashgraphonline/hashinal-wc'],
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;

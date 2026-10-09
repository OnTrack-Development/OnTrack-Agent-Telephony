// EAS project ID is injected at build time. No tokens or keystore secrets in app.
const manifest = require('./app.json').expo;
const id = process.env.EAS_PROJECT_ID || undefined;
module.exports = {
  expo: {
    ...manifest,
    ...(id ? {
      extra: {eas: {projectId: id}},
      updates: {...manifest.updates, url: `https://u.expo.dev/${id}`}
    } : {})
  }
};

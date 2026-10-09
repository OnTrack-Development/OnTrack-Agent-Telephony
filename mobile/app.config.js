// Versioning and APK updates are handled by the signed GitHub release channel.
// No expo-updates runtime and no GitHub credentials embedded inside the APK.
const manifest = require('./app.json').expo;
const id = process.env.EAS_PROJECT_ID || undefined;
module.exports = {expo: {...manifest, ...(id ? {extra: {eas: {projectId: id}}} : {})}};

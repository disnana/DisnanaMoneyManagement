import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Wraps app.json to add what EAS Update needs, without hard-coding account-specific ids in git:
 *  - runtimeVersion policy "sdkVersion" -> "exposdk:<SDK>.0.0", the runtime Expo Go accepts for published updates
 *  - updates.url / extra.eas.projectId from EXPO_PROJECT_ID (set it as a GitHub repository variable), or from
 *    app.json's extra.eas.projectId if you prefer to commit it (a project id is not a secret).
 * Without a project id everything below is skipped, so `expo start` / Expo Go development is unchanged.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId: string | undefined = process.env.EXPO_PROJECT_ID?.trim() || config.extra?.eas?.projectId;
  const entry = process.env.MANE_AUTH_ENTRY?.trim();
  const nodeID = process.env.MANE_NODE_ID;
  const origin = process.env.MANE_NODE_ORIGIN;
  const googleClientID = process.env.MANE_GOOGLE_WEB_CLIENT_ID;
  const projectNumber = process.env.MANE_GOOGLE_PROJECT_NUMBER;
  const rawNodes = process.env.MANE_ANDROID_AUTH_NODES?.trim();
  const nodes: Record<string, string> | undefined = rawNodes
    ? JSON.parse(rawNodes)
    : nodeID && origin ? { [nodeID]: origin } : undefined;
  if (rawNodes && !nodes) throw new Error('Invalid Android authentication node map');
  if (nodes && (typeof nodes !== 'object' || Array.isArray(nodes) || !Object.keys(nodes).length ||
    Object.entries(nodes).some(([id, url]) => !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      typeof url !== 'string' || !url.startsWith('https://') || new URL(url).origin !== url))) {
    throw new Error('Invalid Android authentication node map');
  }
  const loginEntry = entry || (nodes && Object.keys(nodes).length === 1 ? Object.values(nodes)[0] : undefined);
  const maneAuth = loginEntry && nodes && googleClientID && projectNumber
    ? { entry: loginEntry, nodes, googleClientID, projectNumber }
    : undefined;
  const base = { ...config, runtimeVersion: { policy: 'sdkVersion' },
    extra: { ...config.extra, maneAuth } } as ExpoConfig;
  if (!projectId) return base;
  return {
    ...base,
    updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` },
    extra: { ...base.extra, eas: { ...config.extra?.eas, projectId } },
  };
};

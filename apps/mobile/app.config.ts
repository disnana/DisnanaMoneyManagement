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
  const base = { ...config, runtimeVersion: { policy: 'sdkVersion' as const } } as ExpoConfig;
  if (!projectId) return base;
  return {
    ...base,
    updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` },
    extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } },
  };
};

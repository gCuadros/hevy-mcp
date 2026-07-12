export interface Config {
  hevyApiKey: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const hevyApiKey = env.HEVY_API_KEY;
  if (!hevyApiKey) {
    throw new ConfigError(
      "HEVY_API_KEY is not set. Get one from Hevy → Settings → API and pass it as an env var.",
    );
  }
  return { hevyApiKey };
}

import { homedir } from "node:os";
import { join } from "node:path";

export interface Paths {
  config: string;
  tokens: string;
  cacheDir: string;
}

export function paths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.HOME ?? homedir();
  const configHome = env.XDG_CONFIG_HOME ?? join(home, ".config");
  const dataHome = env.XDG_DATA_HOME ?? join(home, ".local", "share");
  const configDir = join(configHome, "sleep-truth");
  return {
    config: join(configDir, "config.json"),
    tokens: join(configDir, "tokens.json"),
    cacheDir: join(dataHome, "sleep-truth", "oura", "sleep"),
  };
}

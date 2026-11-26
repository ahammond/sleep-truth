import { homedir, userInfo } from "node:os";
import { isAbsolute, join } from "node:path";

export interface Paths {
  config: string;
  tokens: string;
  dataDir: string;
  cacheDir: string;
}

/** An environment directory, or undefined when it is empty or relative. The XDG spec says to ignore both. */
function absolute(value: string | undefined): string | undefined {
  return value && isAbsolute(value) ? value : undefined;
}

export function paths(env: NodeJS.ProcessEnv = process.env): Paths {
  // os.homedir() returns $HOME unchecked on POSIX, so the account database is the last resort.
  const home = absolute(env.HOME) ?? absolute(homedir()) ?? userInfo().homedir;
  const configHome = absolute(env.XDG_CONFIG_HOME) ?? join(home, ".config");
  const dataHome = absolute(env.XDG_DATA_HOME) ?? join(home, ".local", "share");
  const configDir = join(configHome, "sleep-truth");
  const dataDir = join(dataHome, "sleep-truth");
  return {
    config: join(configDir, "config.json"),
    tokens: join(configDir, "tokens.json"),
    dataDir,
    cacheDir: join(dataDir, "oura", "sleep"),
  };
}

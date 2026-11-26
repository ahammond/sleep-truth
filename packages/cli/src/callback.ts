import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { SignInError } from "./auth.ts";

export interface CallbackOptions {
  port: number;
  expectedState: string;
  /** Called once the server is listening, to open the browser. */
  onListening: () => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/** The authorization code from a redirect, after checking it belongs to this sign-in. */
export function codeFrom(url: URL, expectedState: string): string {
  if (url.searchParams.get("state") !== expectedState) {
    throw new SignInError("The sign-in response did not come from this sign-in.");
  }
  const error = url.searchParams.get("error");
  if (error) throw new SignInError(`Oura did not finish the sign-in (${error}).`);
  const code = url.searchParams.get("code");
  if (!code) throw new SignInError("The sign-in response had no code.");
  return code;
}

/**
 * Waits for the browser's redirect to http://localhost:<port>/callback.
 * Listens on both loopback addresses, because "localhost" can resolve to either.
 */
export function waitForCallback(options: CallbackOptions): Promise<URL> {
  const { port, expectedState, onListening, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  return new Promise((resolve, reject) => {
    const servers: Server[] = [];
    let settled = false;
    const finish = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const server of servers) server.close();
      outcome();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new SignInError(`No sign-in arrived within ${Math.round(timeoutMs / 60_000)} minutes.`)));
    }, timeoutMs);

    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      const url = new URL(request.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("content-type", "text/plain; charset=utf-8");
      try {
        codeFrom(url, expectedState);
      } catch (error: unknown) {
        response.writeHead(400).end("Sleep Truth sign-in failed. Close this tab and check the terminal.");
        finish(() => reject(error));
        return;
      }
      response.end("Sleep Truth sign-in complete. You can close this tab.");
      finish(() => resolve(url));
    };

    const listen = (host: string): Promise<boolean> =>
      new Promise((done) => {
        const server = createServer(handler);
        server.once("error", (error: NodeJS.ErrnoException) => {
          // A machine without IPv6 loopback is fine; IPv4 alone must work.
          if (host === "::1" && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) done(false);
          else {
            const message = error.code === "EADDRINUSE" ? `Port ${port} is already in use. Close whatever uses it, or set redirect_port.` : error.message;
            finish(() => reject(new Error(message)));
            done(false);
          }
        });
        server.listen(port, host, () => {
          servers.push(server);
          done(true);
        });
      });

    void (async () => {
      const v4 = await listen("127.0.0.1");
      if (!v4 || settled) return;
      await listen("::1");
      if (settled) {
        for (const server of servers) server.close();
        return;
      }
      onListening();
    })();
  });
}

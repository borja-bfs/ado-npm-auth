import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export type AuthMode = "auto" | "pat" | "credential-provider";

export type Args = {
  doValidCheck: boolean;
  skipAuth: boolean;
  configFile?: string;
  azureAuthLocation?: string;
  exitCodeOnReAuthenticate?: number;
  authMode: AuthMode;
};

export function parseArgs(args: string[]): Args {
  const argv = yargs(hideBin(args))
    .option({
      skipCheck: {
        type: "boolean",
        description: "Skip checking the validity of the feeds",
      },
      skipAuth: {
        type: "boolean",
        description: "Skip authenticating the feeds",
      },
      configFile: {
        alias: "c",
        type: "string",
        description: "Skip checking the validity of the feeds",
      },
      azureAuthLocation: {
        type: "string",
        description: "Allow specifying alternate location to azureauth",
      },
      exitCodeOnReAuthenticate: {
        type: "number",
        description: "Exit when re-authentication occurs",
      },
      authMode: {
        type: "string",
        choices: ["auto", "pat", "credential-provider"] as const,
        default: "auto",
        description:
          "Authentication backend: auto, pat, or credential-provider",
      },
    })
    .help()
    .parseSync();

  if (
    argv.authMode !== "auto" &&
    argv.authMode !== "pat" &&
    argv.authMode !== "credential-provider"
  ) {
    throw new Error(`Unsupported authentication mode: ${argv.authMode}`);
  }

  return {
    skipAuth: argv.skipAuth || false,
    doValidCheck: !argv.skipCheck,
    configFile: argv.configFile,
    azureAuthLocation: argv.azureAuthLocation,
    exitCodeOnReAuthenticate: argv.exitCodeOnReAuthenticate,
    authMode: argv.authMode,
  };
}

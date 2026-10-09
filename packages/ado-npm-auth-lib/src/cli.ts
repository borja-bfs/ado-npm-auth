import { arch, platform } from "node:os";
import process from "node:process";

import { isSupportedPlatformAndArchitecture } from "./azureauth/is-supported-platform-and-architecture.js";
import { isCodespaces } from "./utils/is-codespaces.js";
import { logTelemetry } from "./telemetry/index.js";
import type { Args } from "./args.js";
import { parseArgs } from "./args.js";
import { NpmrcFileProvider } from "./npmrc/npmrcFileProvider.js";
import type { ValidatedFeed } from "./fileProvider.js";
import { defaultEmail, defaultUser } from "./fileProvider.js";
import { partition } from "./utils/partition.js";
import { YarnRcFileProvider } from "./yarnrc/yarnrcFileProvider.js";
import { AzureArtifactsCredentialProvider } from "./credentials/azure-artifacts-credential-provider.js";
import { PatCredentialProvider } from "./credentials/pat-credential-provider.js";
import type { CredentialProvider } from "./credentials/credential-provider.js";

export const run = async (args: Args): Promise<null | boolean> => {
  const fileProviders = [
    new NpmrcFileProvider(args.configFile),
    new YarnRcFileProvider(args.configFile),
  ];

  const validatedFeeds: ValidatedFeed[] = [];
  if (args.doValidCheck || args.skipAuth) {
    for (const fileProvider of fileProviders) {
      if (await fileProvider.isSupportedInRepo()) {
        validatedFeeds.push(...(await fileProvider.validateAllUsedFeeds()));
      }
    }
  }

  // Filter to feeds to only feeds that were not authenticated and are actually
  // azure devops feeds by checking if we discovered the adoOrganization for it.
  const invalidFeeds = validatedFeeds.filter(
    (feed) => !feed.isValid && feed.feed.adoOrganization,
  );
  const invalidFeedCount = invalidFeeds.length;

  if (args.doValidCheck && invalidFeedCount == 0) {
    return null;
  }

  if (args.skipAuth && invalidFeedCount != 0) {
    logTelemetry(
      { success: false, automaticSuccess: false, error: "invalid token(s)" },
      true,
    );
    console.log(
      invalidFeedCount == 1
        ? "❌ Your token is invalid."
        : `❌ ${invalidFeedCount} tokens are invalid.`,
    );
    return false;
  }

  try {
    console.log("🔑 Authenticating to package feed...");

    let credentialProvider: CredentialProvider;
    if (args.authMode === "pat") {
      credentialProvider = new PatCredentialProvider(args.azureAuthLocation);
    } else if (
      args.authMode === "credential-provider" ||
      (args.authMode === "auto" &&
        AzureArtifactsCredentialProvider.isAvailable())
    ) {
      credentialProvider = new AzureArtifactsCredentialProvider();
    } else if (args.authMode === "auto" && platform() === "linux") {
      // Preserve the existing Linux behavior, which installs the provider on
      // demand when it is not already present.
      credentialProvider = new AzureArtifactsCredentialProvider(true);
    } else {
      console.log(
        "Azure Artifacts Credential Provider was not found; using PAT authentication.",
      );
      credentialProvider = new PatCredentialProvider(args.azureAuthLocation);
    }

    const feedsToGetTokenFor = new Map<string, string>();
    for (const feed of invalidFeeds.map((feed) => feed.feed)) {
      feedsToGetTokenFor.set(feed.adoOrganization, feed.registry);
    }

    // get a token for each feed
    const organizationCredentialMap = new Map<
      string,
      Awaited<ReturnType<CredentialProvider["acquireCredential"]>>
    >();
    for (const [org, feed] of feedsToGetTokenFor) {
      organizationCredentialMap.set(
        org,
        await credentialProvider.acquireCredential({
          adoOrganization: org,
          registry: feed,
        }),
      );
    }

    // Update the credentials in the invalid feeds.
    for (const invalidFeed of invalidFeeds) {
      const feed = invalidFeed.feed;

      const credential = organizationCredentialMap.get(feed.adoOrganization);
      if (!credential) {
        console.log(`❌ Failed to obtain credentials for ${feed.registry}`);
        return false;
      }
      feed.authToken = credential.password;
      if (!feed.email) {
        feed.email = defaultEmail;
      }
      if (!feed.userName) {
        feed.userName = credential.username || defaultUser;
      }
    }

    const invalidFeedsByProvider = partition(
      invalidFeeds,
      (feed) => feed.fileProvider,
    );
    for (const [fileProvider, updatedFeeds] of invalidFeedsByProvider) {
      await fileProvider.writeWorkspaceRegistries(
        updatedFeeds.map((updatedFeed) => updatedFeed.feed),
      );
    }

    return true;
  } catch (error) {
    logTelemetry(
      {
        success: false,
        automaticSuccess: false,
        error: (error as Error).message,
      },
      true,
    );
    console.log("Encountered error while performing auth", error);
    return false;
  }
};

if (isCodespaces()) {
  // ignore codespaces setups
  process.exit(0);
}

if (!isSupportedPlatformAndArchitecture()) {
  const errorMessage = `Platform ${platform()} and architecture ${arch()} not supported for automatic authentication.`;
  console.log(errorMessage);
  logTelemetry({ success: false, error: errorMessage }, true);
  process.exit(0);
}

export async function main(): Promise<boolean> {
  const args = parseArgs(process.argv);

  try {
    const result = await run(args);
    if (result === null) {
      // current auth is valid, do nothing
      logTelemetry({ success: true });
      console.log("✅ Current authentication is valid");
    } else if (result) {
      // automatic auth was performed
      // advertise success
      logTelemetry({ success: true, automaticSuccess: true });
      console.log("✅ Automatic authentication successful");
      // if the user specified an exit code for reauthenticate, exit
      if (args.exitCodeOnReAuthenticate !== undefined) {
        process.exit(args.exitCodeOnReAuthenticate);
      }
    } else {
      // automatic auth failed (for some reason)
      // advertise failure and link wiki to fix
      console.log("❌ Authentication to package feed failed.");

      return false;
    }
  } catch (error) {
    console.error(error);
    console.log("❌ Authentication to package feed failed.");

    return false;
  }

  return true;
}

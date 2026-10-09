import { defaultUser, type Feed } from "../fileProvider.js";
import {
  credentialProviderPat,
  findCredentialProvider,
} from "../npmrc/nugetCredentialProvider.js";
import type { CredentialProvider, Credential } from "./credential-provider.js";

export class AzureArtifactsCredentialProvider implements CredentialProvider {
  public constructor(private readonly allowDownload = false) {}

  public static isAvailable(): boolean {
    return findCredentialProvider() !== undefined;
  }

  public async acquireCredential(feed: Feed): Promise<Credential> {
    const result = await credentialProviderPat(feed.registry, {
      allowDownload: this.allowDownload,
    });

    return {
      username: result.Username || defaultUser,
      password: result.Password,
    };
  }
}

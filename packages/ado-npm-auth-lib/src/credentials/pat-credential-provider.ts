import { defaultUser, type Feed } from "../fileProvider.js";
import { generateNpmrcPat } from "../npmrc/generate-npmrc-pat.js";
import type { CredentialProvider, Credential } from "./credential-provider.js";

export class PatCredentialProvider implements CredentialProvider {
  public constructor(private readonly azureAuthLocation?: string) {}

  public async acquireCredential(feed: Feed): Promise<Credential> {
    return {
      username: defaultUser,
      password: await generateNpmrcPat(
        feed.adoOrganization,
        feed.registry,
        false,
        this.azureAuthLocation,
      ),
    };
  }
}

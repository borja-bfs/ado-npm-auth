import type { Feed } from "../fileProvider.js";

export type Credential = {
  username: string;
  password: string;
};

export type CredentialProvider = {
  acquireCredential(feed: Feed): Promise<Credential>;
};

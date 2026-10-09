# Azure DevOps NPM Auth

The `ado-npm-auth` package authenticates npm and Yarn clients to Azure Artifacts
feeds and updates the user's credentials file. It supports both the existing
Azure DevOps PAT flow and Microsoft's Azure Artifacts Credential Provider.

The credential-provider flow is PAT-less: the provider uses Microsoft Entra
authentication and obtains a short-lived Azure DevOps session credential. It
does not create an Azure DevOps PAT and does not bypass organizational PAT
policies.

## Configuration files

Keep the feed configuration in the project `.npmrc`. Do not commit credentials
to this file:

```text
registry=https://pkgs.dev.azure.com/ORGANIZATION/_packaging/FEED/npm/registry/
```

The generated credential is written to the user-level file:

| Platform    | User credential file   |
| ----------- | ---------------------- |
| Windows     | `%USERPROFILE%\.npmrc` |
| Linux/macOS | `~/.npmrc`             |

Credentials are short-lived and should not be copied into source control or
shared between laptops. Re-run `ado-npm-auth` on each machine when needed.

## Authentication modes

The CLI supports three modes:

| Mode                  | Behavior                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `auto`                | Prefer the Azure Artifacts Credential Provider when available; otherwise preserve the existing PAT behavior. |
| `credential-provider` | Require the Azure Artifacts Credential Provider. Never fall back to PAT creation.                            |
| `pat`                 | Explicitly use the existing AzureAuth PAT flow.                                                              |

Use the PAT-less backend explicitly when PAT creation is disabled by policy:

```text
ado-npm-auth --auth-mode credential-provider
```

Use `-c` when running from another directory:

```text
ado-npm-auth --auth-mode credential-provider -c C:\path\to\project\.npmrc
```

After authentication, use the package manager normally:

```text
npm install
yarn install
```

## How the credential-provider flow works

1. `ado-npm-auth` reads the registry from the project `.npmrc`.
2. It converts the npm feed URL to the corresponding Azure Artifacts NuGet
   endpoint because Microsoft's provider is a NuGet authentication plugin.
3. The provider authenticates with Microsoft Entra and exchanges the resulting
   bearer token for an Azure DevOps session credential.
4. The credential is returned through the provider's documented JSON protocol.
5. `ado-npm-auth` writes the username and base64-encoded password to the
   user-level `.npmrc`, using npm's standard Azure Artifacts Basic-auth format.

The project `.npmrc` remains credential-free. The provider derives the
appropriate Azure DevOps authority from the feed endpoint; no tenant ID is
hard-coded by this package.

## Windows

Install Microsoft's Azure Artifacts Credential Provider using its official
installation instructions. The provider must be discoverable in one of these
locations:

```text
%USERPROFILE%\.nuget\plugins\netfx\CredentialProvider.Microsoft\CredentialProvider.Microsoft.exe
%USERPROFILE%\.nuget\plugins\netcore\CredentialProvider.Microsoft\CredentialProvider.Microsoft.exe
```

You can also set `NUGET_PLUGIN_PATHS` to the provider executable. The
`Microsoft.NetFx48.NuGet.CredentialProvider` archive is supported, but the
implementation does not depend on a specific archive name or version.

Run:

```powershell
ado-npm-auth --auth-mode credential-provider
```

The provider handles interactive Microsoft Entra sign-in, token acquisition,
and Azure DevOps session-token exchange. The resulting npm credential is
written to `%USERPROFILE%\.npmrc`.

With `--auth-mode auto`, the provider is preferred when discovered. If it is
not installed, `auto` uses the legacy PAT backend for compatibility. Use
`credential-provider` instead when a PAT attempt is not acceptable.

## Linux

The existing Linux integration can use the Azure Artifacts Credential Provider
from the standard NuGet plugin location. If it is not already present,
`auto` preserves the existing behavior of downloading the supported provider
release.

To require an already installed provider and prevent PAT creation:

```bash
ado-npm-auth --auth-mode credential-provider
```

The provider is discovered under:

```text
~/.nuget/plugins/netcore/CredentialProvider.Microsoft/CredentialProvider.Microsoft
```

or through `NUGET_PLUGIN_PATHS`. The generated credential is written to
`~/.npmrc`.

## macOS

macOS can use the credential-provider backend when a compatible Azure Artifacts
Credential Provider executable is installed under the standard NuGet plugin
location or configured through `NUGET_PLUGIN_PATHS`:

```text
~/.nuget/plugins/netcore/CredentialProvider.Microsoft/CredentialProvider.Microsoft
```

Run:

```bash
ado-npm-auth --auth-mode credential-provider
```

This explicit mode requires the provider and does not fall back to PAT
creation. With `auto`, the current compatibility behavior is to use the
provider when discovered and otherwise use the existing PAT backend.

Interactive browser or device authentication depends on the installed
provider and the local Microsoft Entra environment.

## Security

- Credentials are never written to the repository `.npmrc`.
- Access tokens, refresh tokens, passwords, and PAT values are not logged.
- TLS certificate validation remains enabled.
- Do not set `strict-ssl=false` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- `--auth-mode credential-provider` never calls the PAT-creation API.

## ado-npm-auth vs vsts-npm-auth

The main difference between the two is how they function, and where they can run. The `vsts-npm-auth` tool is Windows only, and uses MSAL authentication.

`ado-npm-auth` uses Microsoft's Azure Artifacts Credential Provider when
selected or discovered. The legacy PAT backend uses the `node-azureauth`
library, which wraps the [azureauth-cli](https://github.com/AzureAD/microsoft-authentication-cli),
a cross-platform MSAL wrapper.

![screenshot of tool running](https://github.com/microsoft/ado-npm-auth/raw/main/packages/ado-npm-auth/static/image.png)

Since the `azureauth-cli` is cross-platform, `ado-npm-auth` will also run cross-platform as well!

One of the easiest ways to use the tool is to add it to your `"preinstall"`
script. For a PAT-less setup, select the backend explicitly:

```json
"scripts": {
  "preinstall": "npm exec ado-npm-auth -- --auth-mode credential-provider"
},
```

It will perform a quick pre-flight check and refresh the user-level credential
when it is missing or expired.

![screenshot of tool running via preinstall](https://github.com/microsoft/ado-npm-auth/raw/main/packages/ado-npm-auth/static/preinstall.png)

### Beware the chicken and egg problem

You may need to set the registry to the public npm feed when running `npm exec`
or `npx`, so that the authentication tool itself can be downloaded before the
project's Azure Artifacts registry is authenticated.

There are 2 options to address this case:

### 1: Explictly pass the config file.

You can hop one directory up, or run it from an arbitrary path and pass the configuration.

```cmd
pushd ..
npx --registry https://registry.npmjs.org ado-npm-auth -- -c <myrepo>\.npmrc
popd
```

### 2: configure registry explicilty

If that's the case, set the environment variable `npm_config_registry=https://registry.npmjs.org`.

That will ensure that `npx` or `npm exec` downloads the tool from the public
npm feed before the Azure Artifacts feed is authenticated.

```json
"scripts": {
  "preinstall": "npm_config_registry=https://registry.npmjs.org npm exec ado-npm-auth -- --auth-mode credential-provider"
},
```

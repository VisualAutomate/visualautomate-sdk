# GitHub: an app without code

Four modules, every one a single request to the GitHub REST API, so every one is declared. These are the platform's own GitHub modules, generated from its catalogue.

On the developer portal, the app is:

| | |
| --- | --- |
| Name | GitHub |
| Connection | GitHub, OAuth, scope `repo` |
| Base URL (from the provider) | `https://api.github.com` |

| Module | Request | Notes |
| --- | --- | --- |
| `create-issue` | `POST repos/{owner}/{repo}/issues` | `"{{config.labels \| list}}"` turns "bug, urgent" into a list |
| `list-issues` | `GET repos/{owner}/{repo}/issues` | Optional filters go in `query`, where empty values are left out |
| `update-issue` | `PATCH repos/{owner}/{repo}/issues/{number}` | |
| `comment-on-issue` | `POST repos/{owner}/{repo}/issues/{number}/comments` | |

`errorPath` is `message`: where GitHub puts the reason it refused. `vsa test` at the app's root checks all four manifests. To publish them, create each on the portal with **New module → Call an API**, paste its `manifest.json` into the module's editor, press **Test the call**, and publish. There is nothing here for GitHub to publish.

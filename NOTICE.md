# Notice

PostCherry is a modified version of **Postiz** (https://github.com/gitroomhq/postiz-app),
Copyright (C) Gitroom and the Postiz contributors.

Both Postiz and PostCherry are licensed under the **GNU Affero General Public License v3.0**.
See the [LICENSE](LICENSE) file for the full license text.

## Modifications

Modifications Copyright (C) 2026 PostCherry.

Starting from Postiz `v2.25.0-135-g91c91f63` (October 2026), PostCherry changed:

- **Branding:** product name, logos, favicon and colors (purple → cherry red) across the web app,
  emails, AI assistant texts and all translations.
- **Marketing texts:** removed Postiz user counts, testimonials and tutorial videos.
- **Links:** terms, privacy, affiliate and analytics domains point to postcherry.com.
- **Agency emails:** new agency submissions go to the `ADMIN_EMAIL` setting instead of a Postiz address.
- **Source code link:** a "Source code" menu item and the billing FAQ link to `SOURCE_CODE_URL`,
  so every user can get the source code of the version they use (AGPL-3.0 section 13).
- **Docker setup:** `docker-compose.yaml` builds and runs PostCherry with its own containers.

The full list of changes is in the Git history of this repository.

The name "Postiz" and its logo belong to their owners and are not used for PostCherry branding.

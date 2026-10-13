<p align="center">
  <img alt="PostCherry" src="apps/frontend/public/postcherry-text.svg" width="300"/>
</p>

<p align="center">
  <strong>The cherry on top of your social media.</strong><br />
  AI-powered social media management for agencies.
</p>

<p align="center">
<a href="https://opensource.org/license/agpl-v3">
  <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
</a>
</p>

## What is PostCherry?

PostCherry lets you schedule, automate and analyze social media posts for many brands from one place:

- Schedule posts to 30+ channels (Facebook, Instagram, LinkedIn, X, TikTok, YouTube, Threads, Pinterest, Bluesky, Google Business and more)
- Calendar view, drafts, previews, recurring posts and posting time slots
- AI writing, AI images and AI videos
- Team members, client workspaces and approval flow
- Analytics, media library, short links, RSS auto-posting, webhooks and a public API

## Run it locally

Requirements: Docker Desktop.

1. Create a `.env` file next to `docker-compose.yaml`:
   ```
   JWT_SECRET=<a long random string>
   SOURCE_CODE_URL=<link to your public PostCherry repository>
   ```
2. Build and start:
   ```
   docker compose up -d --build postcherry-postgres postcherry-redis temporal-postgresql temporal-elasticsearch temporal postcherry
   ```
3. Open http://localhost:4010

Social channels need their own developer apps (Meta, LinkedIn, X, TikTok, Google…). Put their keys in the
`environment` section of `docker-compose.yaml`.

## Credits and license

PostCherry is a modified version of [Postiz](https://github.com/gitroomhq/postiz-app) by Gitroom and the
Postiz contributors. Thank you!

PostCherry is licensed under the [GNU Affero General Public License v3.0](LICENSE), the same license as Postiz.
If you run a modified version for other people over a network, you must offer them its source code.
See [NOTICE.md](NOTICE.md) for the list of changes.

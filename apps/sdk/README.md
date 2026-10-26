# PostCherry NodeJS SDK

This is the NodeJS SDK for [PostCherry](https://postcherry.com).

You can start by installing the package:

```bash
npm install @postiz/node
```

## Usage
```typescript
import PostCherry from '@postiz/node';
const postcherry = new PostCherry('your api key', 'your self-hosted instance (optional, defaults to https://app.postcherry.com/api)');
```

The available methods are:
- `post(posts: CreatePostDto)` - Schedule a post to PostCherry
- `postList(filters: GetPostsDto)` - Get a list of posts
- `upload(file: Buffer, extension: string)` - Upload a file to PostCherry
- `integrations()` - Get a list of connected channels
- `deletePost(id: string)` - Delete a post by ID

Alternatively you can call the public API directly with curl, see the [PostCherry source code](https://github.com/studiocog/postcherry) for the API reference.

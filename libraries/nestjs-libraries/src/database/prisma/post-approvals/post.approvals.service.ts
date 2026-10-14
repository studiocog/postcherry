import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { escape, groupBy, truncate, uniq, uniqBy } from 'lodash';
import { State } from '@prisma/client';
import { PostApprovalsRepository } from '@gitroom/nestjs-libraries/database/prisma/post-approvals/post.approvals.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import {
  CreatePostApprovalDto,
  PostApprovalDecisionDto,
} from '@gitroom/nestjs-libraries/dtos/post-approvals/post.approval.dto';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

dayjs.extend(utc);

// randomBytes(32).toString('base64url')
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

type Approval = NonNullable<
  Awaited<ReturnType<PostApprovalsRepository['getByToken']>>
>;
type SubjectPost = Awaited<
  ReturnType<PostApprovalsRepository['getSubjectPosts']>
>[number];
type ApprovalCandidate = Awaited<
  ReturnType<PostApprovalsRepository['getLatestCandidates']>
>[number];
// what decides which posts a request covers
type ScopePost = {
  id: string;
  group: string;
  batchId: string | null;
  integrationId: string;
  intervalInDays: number | null;
};
// a post whose saves can make a decision outdated
type ScopedPost = ScopePost & { state: State; updatedAt: Date };
type Covers = (anchorId: string, post: ScopePost) => boolean;

export type PostApprovalBadge = Omit<
  ApprovalCandidate,
  'postId' | 'batchId'
> & {
  editedAfterDecision: boolean;
};

export type PostApprovalState =
  | 'open'
  | 'locked'
  | 'expired'
  | 'revoked'
  | 'unavailable';

// the page shows its own translated text for each state, the message is for
// other callers of the API
const CLOSED_MESSAGES: Record<Exclude<PostApprovalState, 'open'>, string> = {
  locked: 'This post is already published',
  expired: 'This approval link has expired',
  revoked: 'This approval link was revoked',
  unavailable: 'This post is no longer available',
};

// Client approval is informational in this phase: publishing, the Temporal
// workflows and the post states do not look at it.
// Follow-up: "block publishing until approved", an opt-in per workspace that
// keeps a post with a pending or changes-requested link from being published
// (it needs a new workflow version that checks the latest request first).
@Injectable()
export class PostApprovalsService {
  constructor(
    private _postApprovalsRepository: PostApprovalsRepository,
    private _postsService: PostsService,
    private _notificationService: NotificationService
  ) {}

  private approvalUrl(token: string) {
    return `${process.env.FRONTEND_URL}/approve/${token}`;
  }

  // The posts a request covers. A batch holds every post saved in one go,
  // and an API call can also put several posts of one channel in it (one per
  // day). Like the editor (PostsService.getPostsByGroup), a request covers
  // the post it was made from and, for every other channel, the first post of
  // the batch that repeats the same way. `roots` are root posts in the order
  // they were created.
  private coveredGroups(anchor: ScopePost, roots: ScopePost[]) {
    const groups = new Set([anchor.group]);
    if (!anchor.batchId) {
      return groups;
    }

    const channels = new Set([anchor.integrationId]);
    for (const post of roots) {
      if (
        post.batchId === anchor.batchId &&
        !channels.has(post.integrationId) &&
        post.intervalInDays === anchor.intervalInDays
      ) {
        channels.add(post.integrationId);
        groups.add(post.group);
      }
    }
    return groups;
  }

  // whether a request made from the post `anchorId` covers a post
  private coverage(anchors: ScopePost[], roots: ScopePost[]): Covers {
    const anchorsById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    const covered = new Map<string, Set<string>>();
    return (anchorId, post) => {
      if (post.id === anchorId) {
        return true;
      }

      const anchor = anchorsById.get(anchorId);
      if (!anchor?.batchId || anchor.batchId !== post.batchId) {
        return false;
      }

      const groups =
        covered.get(anchorId) || this.coveredGroups(anchor, roots);
      covered.set(anchorId, groups);
      return groups.has(post.group);
    };
  }

  // the last save of the channels a request covers that the team can still
  // edit (published or failed posts change state without an edit)
  private lastEditOf(anchorId: string, posts: ScopedPost[], covers: Covers) {
    return Math.max(
      0,
      ...posts
        .filter(
          (post) =>
            (post.state === State.QUEUE || post.state === State.DRAFT) &&
            covers(anchorId, post)
        )
        .map((post) => +post.updatedAt)
    );
  }

  // A decision is about the version the client saw: when the team saves the
  // post after it, the badge says so until the client decides again.
  private isEditedAfterDecision(
    approval: { status: ApprovalCandidate['status']; decidedAt: Date | null },
    lastEdit: number
  ) {
    return (
      approval.status !== 'PENDING' &&
      !!approval.decidedAt &&
      lastEdit > +approval.decidedAt
    );
  }

  async createRequest(
    orgId: string,
    userId: string,
    postId: string,
    body: CreatePostApprovalDto
  ) {
    const post = await this._postApprovalsRepository.getRootPost(
      orgId,
      postId
    );
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // the client could not decide on a post that already went out on one of
    // its channels (see resolve)
    const roots = post.batchId
      ? await this._postApprovalsRepository.getBatchRootPosts(orgId, [
          post.batchId,
        ])
      : [];
    const covers = this.coverage([post], roots);
    if (
      [post, ...roots].some(
        (p) => p.state === State.PUBLISHED && covers(post.id, p)
      )
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: CLOSED_MESSAGES.locked,
        state: 'locked',
      });
    }

    const { token, ...approval } =
      await this._postApprovalsRepository.createApproval({
        organizationId: orgId,
        postId: post.id,
        group: post.group,
        batchId: post.batchId,
        token: randomBytes(32).toString('base64url'),
        clientName: body.clientName?.trim() || null,
        requestedByUserId: userId,
        expiresAt: dayjs
          .utc()
          .add(body.expiresInDays || 30, 'day')
          .toDate(),
      });

    return { ...approval, url: this.approvalUrl(token) };
  }

  // the requests of the post for the team, the token only goes out in the link
  async listForPost(orgId: string, postId: string) {
    const post = await this._postApprovalsRepository.getRootPost(
      orgId,
      postId
    );
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const roots = post.batchId
      ? await this._postApprovalsRepository.getBatchRootPosts(orgId, [
          post.batchId,
        ])
      : [];
    const candidates = await this._postApprovalsRepository.listForSubject(
      orgId,
      uniq([post.id, ...roots.map((root) => root.id)]),
      post.batchId
    );
    const anchors = await this._postApprovalsRepository.getAnchorPosts(
      orgId,
      uniq(candidates.map((candidate) => candidate.postId))
    );

    // only the requests whose preview holds this post
    const covers = this.coverage(anchors, roots);
    const posts = uniqBy([post, ...roots], (p) => p.id);
    const now = new Date();
    return candidates
      .filter((candidate) => covers(candidate.postId, post))
      .slice(0, 20)
      .map(({ token, requestedBy, postId: anchorId, ...approval }) => ({
        ...approval,
        url: this.approvalUrl(token),
        active: !approval.revokedAt && approval.expiresAt > now,
        editedAfterDecision: this.isEditedAfterDecision(
          approval,
          this.lastEditOf(anchorId, posts, covers)
        ),
        requestedBy:
          [requestedBy?.name, requestedBy?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || null,
      }));
  }

  async revoke(orgId: string, id: string) {
    const { count } = await this._postApprovalsRepository.revoke(orgId, id);
    if (!count) {
      throw new NotFoundException('Approval link not found');
    }

    return { success: true };
  }

  // The latest request that still counts for each root post. A request made
  // from one channel of the post counts for the channels its preview shows.
  async getStatuses(
    orgId: string,
    postIds: string[]
  ): Promise<Record<string, PostApprovalBadge>> {
    const ids = uniq(postIds.filter(Boolean));
    if (!ids.length) {
      return {};
    }

    const posts = await this._postApprovalsRepository.getPostsForStatuses(
      orgId,
      ids
    );
    const batchIds = uniq(
      posts.map((p) => p.batchId).filter((id): id is string => !!id)
    );
    const roots = batchIds.length
      ? await this._postApprovalsRepository.getBatchRootPosts(orgId, batchIds)
      : [];
    const candidates =
      await this._postApprovalsRepository.getLatestCandidates(
        orgId,
        uniq([...posts, ...roots].map((p) => p.id)),
        batchIds
      );
    if (!candidates.length) {
      return {};
    }

    const anchors = await this._postApprovalsRepository.getAnchorPosts(
      orgId,
      uniq(candidates.map((candidate) => candidate.postId))
    );
    const covers = this.coverage(anchors, roots);
    const scoped = uniqBy([...posts, ...roots], (p) => p.id);
    // the saves only matter for a decision, once per request
    const lastEdits = new Map<string, number>();
    const lastEditFor = (anchorId: string) => {
      const lastEdit =
        lastEdits.get(anchorId) ?? this.lastEditOf(anchorId, scoped, covers);
      lastEdits.set(anchorId, lastEdit);
      return lastEdit;
    };

    return posts.reduce((all, post) => {
      const latest = candidates.find((candidate) =>
        covers(candidate.postId, post)
      );
      if (latest) {
        const { postId: anchorId, batchId, ...badge } = latest;
        all[post.id] = {
          ...badge,
          editedAfterDecision:
            badge.status !== 'PENDING' &&
            this.isEditedAfterDecision(badge, lastEditFor(anchorId)),
        };
      }
      return all;
    }, {} as Record<string, PostApprovalBadge>);
  }

  private async resolve(token: string): Promise<{
    approval: Approval;
    state: PostApprovalState;
    channels: SubjectPost[][];
  }> {
    if (!TOKEN_FORMAT.test(token || '')) {
      throw new NotFoundException('Approval link not found');
    }

    const approval = await this._postApprovalsRepository.getByToken(token);
    if (!approval || approval.deletedAt) {
      throw new NotFoundException('Approval link not found');
    }

    if (approval.revokedAt) {
      return { approval, state: 'revoked', channels: [] };
    }

    if (approval.expiresAt <= new Date()) {
      return { approval, state: 'expired', channels: [] };
    }

    // the post the link was created from as it is now (the batch can be set
    // after the request and the group changes on every save in the editor),
    // also when it was deleted since: its other channels still show
    const [anchor] = await this._postApprovalsRepository.getAnchorPosts(
      approval.organizationId,
      [approval.postId]
    );
    const posts = anchor
      ? await this._postApprovalsRepository.getSubjectPosts(
          approval.organizationId,
          anchor.batchId,
          anchor.group
        )
      : [];
    const covered = anchor
      ? this.coveredGroups(
          anchor,
          posts.filter((post) => !post.parentPostId)
        )
      : new Set<string>();

    // one entry per channel with its thread in order, the channel the link
    // was created from first
    const channels = Object.values(
      groupBy(
        posts.filter((post) => covered.has(post.group)),
        (post) => post.group
      )
    )
      .map(
        (list) =>
          this._postsService.arrangePostsByGroup(
            list
          ) as unknown as SubjectPost[]
      )
      .filter((list) => !!list.length && !!list[0].integration)
      .sort(
        (a, b) =>
          Number(b[0].id === approval.postId) -
          Number(a[0].id === approval.postId)
      );

    if (!channels.length) {
      return { approval, state: 'unavailable', channels: [] };
    }

    return {
      approval,
      state: channels.some((list) => list[0].state === State.PUBLISHED)
        ? 'locked'
        : 'open',
      channels,
    };
  }

  // only what the page shows, the stored media also holds library ids
  private publicMedia(image: string | null) {
    try {
      const media = JSON.parse(image || '[]');
      return (Array.isArray(media) ? media : [])
        .filter((m: any) => typeof m?.path === 'string' && !!m.path)
        .map((m: any) => ({
          path: m.path as string,
          ...(typeof m.thumbnail === 'string'
            ? { thumbnail: m.thumbnail as string }
            : {}),
          ...(typeof m.alt === 'string' ? { alt: m.alt as string } : {}),
        }));
    } catch (err) {
      return [];
    }
  }

  // The public page of a link: only the content needed to preview the post,
  // no ids of the organization, channels, posts or users and no settings.
  async getPublic(token: string) {
    const { approval, state, channels } = await this.resolve(token);
    if (state !== 'open' && state !== 'locked') {
      return { state };
    }

    // the same saves the badge of the team counts (lastEditOf), from the
    // channels already loaded here
    const lastEdit = Math.max(
      0,
      ...channels
        .map((list) => list[0])
        .filter(
          (post) => post.state === State.QUEUE || post.state === State.DRAFT
        )
        .map((post) => +post.updatedAt)
    );

    return {
      state,
      status: approval.status,
      clientName: approval.clientName,
      decidedByName: approval.decidedByName,
      clientComment: approval.clientComment,
      decidedAt: approval.decidedAt,
      editedAfterDecision: this.isEditedAfterDecision(approval, lastEdit),
      expiresAt: approval.expiresAt,
      channels: channels.map((list) => ({
        integration: {
          name: list[0].integration.name,
          picture: list[0].integration.picture,
          providerIdentifier: list[0].integration.providerIdentifier,
          profile: list[0].integration.profile,
        },
        publishDate: list[0].publishDate,
        published: list[0].state === 'PUBLISHED',
        values: list.map((post) => ({
          content: sanitizePostContent(post.content),
          media: this.publicMedia(post.image),
        })),
      })),
    };
  }

  // The client can change the decision until the post is published or the
  // link expires or is revoked. Approval is informational, publishing does
  // not wait for it (see the follow-up above the class).
  async decide(token: string, body: PostApprovalDecisionDto) {
    const { approval, state, channels } = await this.resolve(token);
    if (state !== 'open') {
      // the state lets the page explain it in the language of the client
      throw new BadRequestException({
        statusCode: 400,
        message: CLOSED_MESSAGES[state],
        state,
      });
    }

    const comment = body.comment?.trim() || null;
    const name = body.name?.trim() || null;
    await this._postApprovalsRepository.decide(
      approval.id,
      body.decision,
      comment,
      name
    );

    // the decision is saved, a notification that fails must not fail it
    try {
      await this.notifyTeam(approval, channels, body.decision, comment, name);
    } catch (err) {}

    return this.getPublic(token);
  }

  // Notifications are rendered as HTML (in the app and in the email), so
  // everything the client typed and the channel names are escaped.
  private async notifyTeam(
    approval: Approval,
    channels: SubjectPost[][],
    decision: PostApprovalDecisionDto['decision'],
    comment: string | null,
    name: string | null
  ) {
    const who = escape(name || approval.clientName || 'Your client');
    const channelNames = escape(
      uniq(channels.map((list) => list[0].integration.name)).join(', ')
    );
    const date = dayjs
      .utc(Math.min(...channels.map((list) => +list[0].publishDate)))
      .format('MMM D, YYYY HH:mm');
    const quote = comment
      ? ` Comment: "${escape(truncate(comment, { length: 300 }))}"`
      : '';
    const link = `${process.env.FRONTEND_URL}/p/${channels[0][0].id}?share=true`;

    await this._notificationService.inAppNotification(
      approval.organizationId,
      decision === 'APPROVED'
        ? 'Post approved by your client'
        : 'Your client requested changes',
      decision === 'APPROVED'
        ? `${who} approved the post planned for ${date} UTC on ${channelNames}.${quote} ${link}`
        : `${who} requested changes to the post planned for ${date} UTC on ${channelNames}.${quote} ${link}`,
      true,
      true,
      'info'
    );
  }
}

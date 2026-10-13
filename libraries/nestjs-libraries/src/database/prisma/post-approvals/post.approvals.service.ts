import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { escape, groupBy, truncate, uniq } from 'lodash';
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

export type PostApprovalBadge = Omit<ApprovalCandidate, 'postId' | 'batchId'>;

export type PostApprovalState =
  | 'open'
  | 'locked'
  | 'expired'
  | 'revoked'
  | 'unavailable';

const CLOSED_MESSAGES: Record<Exclude<PostApprovalState, 'open'>, string> = {
  locked: 'This post is already published',
  expired: 'This approval link has expired',
  revoked: 'This approval link was revoked',
  unavailable: 'This post is no longer available',
};

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

    const now = new Date();
    return (
      await this._postApprovalsRepository.listForSubject(
        orgId,
        post.id,
        post.batchId
      )
    ).map(({ token, requestedBy, ...approval }) => ({
      ...approval,
      url: this.approvalUrl(token),
      active: !approval.revokedAt && approval.expiresAt > now,
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
  // from one channel of the post counts for all the channels saved with it.
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
    const candidates =
      await this._postApprovalsRepository.getLatestCandidates(
        orgId,
        ids,
        batchIds
      );

    return posts.reduce((all, post) => {
      const latest = candidates.find(
        (c) =>
          c.postId === post.id || (!!c.batchId && c.batchId === post.batchId)
      );
      if (latest) {
        const { postId, batchId, ...badge } = latest;
        all[post.id] = badge;
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

    // the live batch and group of the post: the batch can be set after the
    // request and the group changes on every save in the editor
    const root = await this._postApprovalsRepository.getRootPost(
      approval.organizationId,
      approval.postId
    );
    const batchId = root?.batchId || approval.batchId;
    const posts =
      root || batchId
        ? await this._postApprovalsRepository.getSubjectPosts(
            approval.organizationId,
            batchId,
            root?.group || approval.group
          )
        : [];

    // one entry per channel with its thread in order, the channel the link
    // was created from first
    const channels = Object.values(groupBy(posts, (post) => post.group))
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
      state: channels.some((list) => list[0].state === 'PUBLISHED')
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

    return {
      state,
      status: approval.status,
      clientName: approval.clientName,
      decidedByName: approval.decidedByName,
      clientComment: approval.clientComment,
      decidedAt: approval.decidedAt,
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
  // not wait for it.
  async decide(token: string, body: PostApprovalDecisionDto) {
    const { approval, state, channels } = await this.resolve(token);
    if (state !== 'open') {
      throw new BadRequestException(CLOSED_MESSAGES[state]);
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
        ? `${who} approved the post scheduled for ${date} UTC on ${channelNames}.${quote} ${link}`
        : `${who} requested changes to the post scheduled for ${date} UTC on ${channelNames}.${quote} ${link}`,
      true,
      true,
      'info'
    );
  }
}

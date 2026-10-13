import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { PostApprovalStatus, State } from '@prisma/client';

@Injectable()
export class PostApprovalsRepository {
  constructor(
    private _postApproval: PrismaRepository<'postApproval'>,
    private _post: PrismaRepository<'post'>
  ) {}

  // the root post (not a thread comment) an approval is anchored on
  getRootPost(orgId: string, postId: string) {
    return this._post.model.post.findFirst({
      where: {
        id: postId,
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        group: true,
        batchId: true,
      },
    });
  }

  createApproval(data: {
    organizationId: string;
    postId: string;
    group: string;
    batchId: string | null;
    token: string;
    clientName: string | null;
    requestedByUserId: string;
    expiresAt: Date;
  }) {
    return this._postApproval.model.postApproval.create({
      data,
      select: {
        id: true,
        token: true,
        status: true,
        clientName: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  // the requests made from any channel of the post
  listForSubject(orgId: string, postId: string, batchId: string | null) {
    return this._postApproval.model.postApproval.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [{ postId }, ...(batchId ? [{ batchId }] : [])],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
      select: {
        id: true,
        token: true,
        status: true,
        clientName: true,
        decidedByName: true,
        clientComment: true,
        decidedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        requestedBy: {
          select: {
            name: true,
            lastName: true,
          },
        },
      },
    });
  }

  getByToken(token: string) {
    return this._postApproval.model.postApproval.findUnique({
      where: {
        token,
      },
      select: {
        id: true,
        organizationId: true,
        postId: true,
        group: true,
        batchId: true,
        status: true,
        clientName: true,
        decidedByName: true,
        clientComment: true,
        decidedAt: true,
        expiresAt: true,
        revokedAt: true,
        deletedAt: true,
      },
    });
  }

  revoke(orgId: string, id: string) {
    return this._postApproval.model.postApproval.updateMany({
      where: {
        id,
        organizationId: orgId,
        revokedAt: null,
        deletedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  decide(
    id: string,
    status: PostApprovalStatus,
    comment: string | null,
    name: string | null
  ) {
    return this._postApproval.model.postApproval.update({
      where: {
        id,
      },
      data: {
        status,
        clientComment: comment,
        decidedByName: name,
        decidedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        decidedAt: true,
      },
    });
  }

  // every channel of the post (the batch), or the group of older posts, with
  // only the channel fields a preview shows
  getSubjectPosts(orgId: string, batchId: string | null, group: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        integration: {
          deletedAt: null,
        },
        ...(batchId ? { batchId } : { group }),
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        group: true,
        parentPostId: true,
        content: true,
        image: true,
        publishDate: true,
        state: true,
        updatedAt: true,
        integration: {
          select: {
            name: true,
            picture: true,
            providerIdentifier: true,
            profile: true,
          },
        },
      },
    });
  }

  // the channels of the posts the team can still edit, with the time of their
  // last save (published or failed posts change state without an edit)
  getEditablePosts(orgId: string, postIds: string[], batchIds: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        state: {
          in: [State.QUEUE, State.DRAFT],
        },
        OR: [
          { id: { in: postIds } },
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
        ],
      },
      select: {
        id: true,
        batchId: true,
        updatedAt: true,
      },
    });
  }

  getPostsForStatuses(orgId: string, postIds: string[]) {
    return this._post.model.post.findMany({
      where: {
        id: {
          in: postIds,
        },
        organizationId: orgId,
      },
      select: {
        id: true,
        batchId: true,
      },
    });
  }

  // the requests that still mean something for a badge: not revoked, and
  // either decided or still waiting within the link lifetime
  getLatestCandidates(orgId: string, postIds: string[], batchIds: string[]) {
    return this._postApproval.model.postApproval.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        revokedAt: null,
        OR: [
          { postId: { in: postIds } },
          ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
        ],
        AND: [
          {
            OR: [
              { status: { not: PostApprovalStatus.PENDING } },
              { expiresAt: { gt: new Date() } },
            ],
          },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        postId: true,
        batchId: true,
        status: true,
        clientName: true,
        decidedByName: true,
        clientComment: true,
        decidedAt: true,
      },
    });
  }
}

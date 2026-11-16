import { createHash } from 'crypto';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
//@ts-ignore
import mime from 'mime';

type MatrixFields = {
  homeserver: string;
  accessToken: string;
  roomId: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

@Rules(
  'Matrix (Element) posts plain text into a room, maximum 30000 characters; pictures and videos are uploaded to the homeserver and sent as separate messages after the text'
)
export class MatrixProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 10;
  identifier = 'matrix';
  name = 'Matrix';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

  maxLength() {
    return 30000;
  }

  async customFields() {
    return [
      {
        key: 'homeserver',
        label: 'Homeserver URL',
        defaultValue: 'https://matrix.org',
        validation: `/^https:\\/\\/[^\\s\\/]+(\\/\\S*)?$/`,
        type: 'text' as const,
        hint: 'The client URL of the homeserver of the account that posts, for example https://matrix.org',
      },
      {
        key: 'accessToken',
        label: 'Access token',
        validation: `/^\\S{10,}$/`,
        type: 'password' as const,
        hint: 'In Element sign in as the posting account (a dedicated bot account is best): Settings > Help & About > Advanced > Access token',
      },
      {
        key: 'roomId',
        label: 'Room ID or alias',
        validation: `/^[!#]\\S+:\\S+$/`,
        type: 'text' as const,
        hint: 'Room settings > Advanced > Internal room ID (!abc:server) or the room address (#room:server). The account must have joined the room',
      },
    ];
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('M_UNKNOWN_TOKEN') || body.includes('M_MISSING_TOKEN')) {
      return {
        type: 'refresh-token',
        value:
          'The Matrix access token is no longer valid, please reconnect the channel',
      };
    }

    if (body.includes('M_FORBIDDEN')) {
      return {
        type: 'bad-body',
        value:
          'The Matrix account is not allowed to post in this room (it must be a member with permission to send messages)',
      };
    }

    if (body.includes('M_TOO_LARGE') || status === 413) {
      return {
        type: 'bad-body',
        value: 'The media is larger than the Matrix homeserver allows',
      };
    }

    if (body.includes('M_LIMIT_EXCEEDED')) {
      return {
        type: 'retry',
        value: 'Matrix rate limit reached, please try again later',
      };
    }

    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  private homeserver(fields: MatrixFields) {
    return fields.homeserver.trim().replace(/\/+$/, '');
  }

  private headers(fields: MatrixFields) {
    return { Authorization: `Bearer ${fields.accessToken.trim()}` };
  }

  // #alias:server -> !id:server, a room id is returned as is
  private async resolveRoomId(fields: MatrixFields): Promise<string> {
    const room = fields.roomId.trim();
    if (room.indexOf('#') !== 0) {
      return room;
    }

    const { room_id } = await (
      await this.fetch(
        `${this.homeserver(
          fields
        )}/_matrix/client/v3/directory/room/${encodeURIComponent(room)}`,
        { headers: this.headers(fields) },
        this.identifier
      )
    ).json();

    return room_id;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    let fields: MatrixFields;
    try {
      fields = JSON.parse(Buffer.from(params.code, 'base64').toString());
      if (new URL(fields.homeserver.trim()).protocol !== 'https:') {
        return 'The homeserver URL must start with https://';
      }
    } catch (err) {
      return 'Invalid homeserver URL';
    }

    let userId: string;
    try {
      ({ user_id: userId } = await (
        await this.fetch(
          `${this.homeserver(fields)}/_matrix/client/v3/account/whoami`,
          { headers: this.headers(fields) }
        )
      ).json());
    } catch (err) {
      return 'Invalid homeserver URL or access token';
    }

    let roomId: string;
    try {
      roomId = await this.resolveRoomId(fields);
    } catch (err) {
      return 'This room address was not found';
    }

    try {
      const { joined_rooms } = await (
        await this.fetch(
          `${this.homeserver(fields)}/_matrix/client/v3/joined_rooms`,
          { headers: this.headers(fields) }
        )
      ).json();

      if (!(joined_rooms || []).includes(roomId)) {
        return 'The account has not joined this room: invite it and accept the invite first';
      }
    } catch (err) {
      return 'Could not read the rooms of this account';
    }

    let name = fields.roomId.trim();
    try {
      ({ name } = await (
        await this.fetch(
          `${this.homeserver(
            fields
          )}/_matrix/client/v3/rooms/${encodeURIComponent(
            roomId
          )}/state/m.room.name/`,
          { headers: this.headers(fields) }
        )
      ).json());
    } catch (err) {
      // rooms without a name keep the id / alias the user typed
    }

    return {
      // room ids are global, the same room is the same destination
      id: createHash('sha256').update(roomId).digest('hex').slice(0, 24),
      name: name || fields.roomId.trim(),
      // the token stays in customInstanceDetails
      accessToken: userId,
      refreshToken: userId,
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      picture: '',
      username: userId,
    };
  }

  // Streams the file to the homeserver (raw body), returns its mxc:// URI
  private async upload(
    fields: MatrixFields,
    media: NonNullable<PostDetails['media']>[number],
    filename: string,
    mimetype: string,
    size: number
  ): Promise<string> {
    const data = await this.runStreamedUpload(async () => {
      return (
        await this.getSsrfSafeAxios().post(
          `${this.homeserver(
            fields
          )}/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`,
          await this.mediaStream(media.path, this.identifier),
          {
            headers: {
              ...this.headers(fields),
              'Content-Type': mimetype,
              'Content-Length': String(size),
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }
        )
      ).data;
    }, this.identifier);

    return data.content_uri;
  }

  // The transaction id is derived from the post, so a retried publish
  // returns the event already sent instead of sending it twice
  private async send(
    fields: MatrixFields,
    roomId: string,
    txnId: string,
    content: object
  ): Promise<string> {
    const { event_id } = await (
      await this.fetch(
        `${this.homeserver(
          fields
        )}/_matrix/client/v3/rooms/${encodeURIComponent(
          roomId
        )}/send/m.room.message/${encodeURIComponent(txnId)}`,
        {
          method: 'PUT',
          headers: {
            ...this.headers(fields),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(content),
        },
        this.identifier
      )
    ).json();

    return event_id;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const fields: MatrixFields = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );

    const roomId = await this.resolveRoomId(fields);
    const eventIds: string[] = [];

    if (firstPost.message?.trim()) {
      eventIds.push(
        await this.send(fields, roomId, `postcherry-${firstPost.id}-text`, {
          msgtype: 'm.text',
          body: firstPost.message,
          format: 'org.matrix.custom.html',
          formatted_body: escapeHtml(firstPost.message).replace(/\n/g, '<br>'),
        })
      );
    }

    for (const [index, media] of (firstPost.media || []).entries()) {
      const filename =
        media.path.split('/').pop()?.split('?')[0] || `media-${index + 1}`;
      const mimetype =
        mime.getType(filename) ||
        (media.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const size = await this.mediaSize(media.path, this.identifier);
      const url = await this.upload(fields, media, filename, mimetype, size);

      eventIds.push(
        await this.send(
          fields,
          roomId,
          `postcherry-${firstPost.id}-media-${index}`,
          {
            msgtype: media.type === 'video' ? 'm.video' : 'm.image',
            body: media.alt || filename,
            filename,
            url,
            info: { mimetype, size },
          }
        )
      );
    }

    return [
      {
        id: firstPost.id,
        postId: eventIds[0] || firstPost.id,
        releaseURL: eventIds[0]
          ? `https://matrix.to/#/${encodeURIComponent(
              roomId
            )}/${encodeURIComponent(eventIds[0])}`
          : '',
        status: 'completed',
      },
    ];
  }
}

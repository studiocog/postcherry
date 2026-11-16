import { RedditSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/reddit.dto';
import { PinterestSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { LemmySettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/lemmy.dto';
import { DribbbleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dribbble.dto';
import { DiscordDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discord.dto';
import { SlackDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/slack.dto';
import { KickDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/kick.dto';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { LinkedinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto';
import { IsIn } from 'class-validator';
import { MediumSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/medium.settings.dto';
import { DevToSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/dev.to.settings.dto';
import { HashnodeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/hashnode.settings.dto';
import { WordpressDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import { ListmonkDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/listmonk.dto';
import { GmbSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto';
import { FarcasterDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/farcaster.dto';
import { FacebookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';
import { MoltbookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/moltbook.dto';
import { SkoolDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/skool.dto';
import { WhopDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/whop.dto';
import { MeweDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/mewe.dto';
import { TumblrDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tumblr.dto';
import { GhostDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/ghost.dto';
import { MailchimpDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/mailchimp.dto';
import { KitDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/kit.dto';
import { BrevoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/brevo.dto';
import { BeehiivDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/beehiiv.dto';
import { ShopifyDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/shopify.dto';
import { WebflowDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/webflow.dto';
import { NotionDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/notion.dto';
import { PeertubeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/peertube.dto';
import { VimeoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/vimeo.dto';
import { DiscourseDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discourse.dto';
import { CircleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/circle.dto';

export type ProviderExtension<T extends string, M> = { __type: T } & M;
export type AllProvidersSettings =
  | ProviderExtension<'reddit', RedditSettingsDto>
  | ProviderExtension<'lemmy', LemmySettingsDto>
  | ProviderExtension<'youtube', YoutubeSettingsDto>
  | ProviderExtension<'pinterest', PinterestSettingsDto>
  | ProviderExtension<'dribbble', DribbbleDto>
  | ProviderExtension<'tiktok', TikTokDto>
  | ProviderExtension<'tiktok-business', TikTokDto>
  | ProviderExtension<'discord', DiscordDto>
  | ProviderExtension<'slack', SlackDto>
  | ProviderExtension<'kick', KickDto>
  | ProviderExtension<'twitch', TwitchDto>
  | ProviderExtension<'x', XDto>
  | ProviderExtension<'linkedin', LinkedinDto>
  | ProviderExtension<'linkedin-page', LinkedinDto>
  | ProviderExtension<'instagram', InstagramDto>
  | ProviderExtension<'instagram-standalone', InstagramDto>
  | ProviderExtension<'medium', MediumSettingsDto>
  | ProviderExtension<'devto', DevToSettingsDto>
  | ProviderExtension<'hashnode', HashnodeSettingsDto>
  | ProviderExtension<'wordpress', WordpressDto>
  | ProviderExtension<'listmonk', ListmonkDto>
  | ProviderExtension<'gmb', GmbSettingsDto>
  | ProviderExtension<'facebook', FacebookDto>
  | ProviderExtension<'wrapcast', FarcasterDto>
  | ProviderExtension<'threads', None>
  | ProviderExtension<'mastodon', None>
  | ProviderExtension<'bluesky', None>
  | ProviderExtension<'telegram', None>
  | ProviderExtension<'nostr', None>
  | ProviderExtension<'moltbook', MoltbookDto>
  | ProviderExtension<'vk', None>
  | ProviderExtension<'skool', SkoolDto>
  | ProviderExtension<'mewe', MeweDto>
  | ProviderExtension<'tumblr', TumblrDto>
  | ProviderExtension<'whop', WhopDto>
  | ProviderExtension<'teams', None>
  | ProviderExtension<'google-chat', None>
  | ProviderExtension<'mattermost', None>
  | ProviderExtension<'rocketchat', None>
  | ProviderExtension<'zulip', None>
  | ProviderExtension<'matrix', None>
  | ProviderExtension<'webhook', None>
  | ProviderExtension<'line', None>
  | ProviderExtension<'viber', None>
  | ProviderExtension<'ghost', GhostDto>
  | ProviderExtension<'mailchimp', MailchimpDto>
  | ProviderExtension<'kit', KitDto>
  | ProviderExtension<'brevo', BrevoDto>
  | ProviderExtension<'beehiiv', BeehiivDto>
  | ProviderExtension<'shopify', ShopifyDto>
  | ProviderExtension<'webflow', WebflowDto>
  | ProviderExtension<'notion', NotionDto>
  | ProviderExtension<'misskey', None>
  | ProviderExtension<'pixelfed', None>
  | ProviderExtension<'peertube', PeertubeDto>
  | ProviderExtension<'vimeo', VimeoDto>
  | ProviderExtension<'discourse', DiscourseDto>
  | ProviderExtension<'circle', CircleDto>;

type None = NonNullable<unknown>;

export const allProviders = (setEmpty?: any) => {
  return [
    { value: RedditSettingsDto, name: 'reddit' },
    { value: LemmySettingsDto, name: 'lemmy' },
    { value: YoutubeSettingsDto, name: 'youtube' },
    { value: PinterestSettingsDto, name: 'pinterest' },
    { value: DribbbleDto, name: 'dribbble' },
    { value: TikTokDto, name: 'tiktok' },
    { value: TikTokDto, name: 'tiktok-business' },
    { value: DiscordDto, name: 'discord' },
    { value: SlackDto, name: 'slack' },
    { value: KickDto, name: 'kick' },
    { value: TwitchDto, name: 'twitch' },
    { value: XDto, name: 'x' },
    { value: LinkedinDto, name: 'linkedin' },
    { value: LinkedinDto, name: 'linkedin-page' },
    { value: InstagramDto, name: 'instagram' },
    { value: InstagramDto, name: 'instagram-standalone' },
    { value: MediumSettingsDto, name: 'medium' },
    { value: DevToSettingsDto, name: 'devto' },
    { value: WordpressDto, name: 'wordpress' },
    { value: HashnodeSettingsDto, name: 'hashnode' },
    { value: ListmonkDto, name: 'listmonk' },
    { value: GmbSettingsDto, name: 'gmb' },
    { value: FarcasterDto, name: 'wrapcast' },
    { value: FacebookDto, name: 'facebook' },
    { value: setEmpty, name: 'threads' },
    { value: setEmpty, name: 'mastodon' },
    { value: setEmpty, name: 'bluesky' },
    { value: setEmpty, name: 'telegram' },
    { value: setEmpty, name: 'nostr' },
    { value: setEmpty, name: 'vk' },
    { value: MoltbookDto, name: 'moltbook' },
    { value: SkoolDto, name: 'skool' },
    { value: WhopDto, name: 'whop' },
    { value: MeweDto, name: 'mewe' },
    { value: TumblrDto, name: 'tumblr' },
    { value: setEmpty, name: 'teams' },
    { value: setEmpty, name: 'google-chat' },
    { value: setEmpty, name: 'mattermost' },
    { value: setEmpty, name: 'rocketchat' },
    { value: setEmpty, name: 'zulip' },
    { value: setEmpty, name: 'matrix' },
    { value: setEmpty, name: 'webhook' },
    { value: setEmpty, name: 'line' },
    { value: setEmpty, name: 'viber' },
    { value: GhostDto, name: 'ghost' },
    { value: MailchimpDto, name: 'mailchimp' },
    { value: KitDto, name: 'kit' },
    { value: BrevoDto, name: 'brevo' },
    { value: BeehiivDto, name: 'beehiiv' },
    { value: ShopifyDto, name: 'shopify' },
    { value: WebflowDto, name: 'webflow' },
    { value: NotionDto, name: 'notion' },
    { value: setEmpty, name: 'misskey' },
    { value: setEmpty, name: 'pixelfed' },
    { value: PeertubeDto, name: 'peertube' },
    { value: VimeoDto, name: 'vimeo' },
    { value: DiscourseDto, name: 'discourse' },
    { value: CircleDto, name: 'circle' },
  ].filter((f) => f.value);
};

export class EmptySettings {
  @IsIn(allProviders(EmptySettings).map((p) => p.name), {
    message: `"__type" must be ${allProviders(EmptySettings)
      .map((p) => p.name)
      .join(', ')}`,
  })
  __type: string;
}

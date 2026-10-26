import {
  AnalyticsData,
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { LinkedinProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.provider';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  'LinkedIn can have maximum one attachment when selecting video, when choosing a carousel on LinkedIn minimum amount of attachment must be two, and only pictures, if uploading a video, LinkedIn can have only one attachment'
)
export class LinkedinPageProvider
  extends LinkedinProvider
  implements SocialProvider
{
  override identifier = 'linkedin-page';
  override name = 'LinkedIn Page';
  override isBetweenSteps = true;
  override refreshWait = true;
  override maxConcurrentJob = 2; // LinkedIn Page has professional posting limits
  // Community Management API only (the CM product must be alone on its app,
  // so openid / profile don't exist there):
  // - r_basicprofile: the member's id / name / picture (/v2/me)
  // - rw_organization_admin: list the Pages the member runs and Page analytics
  // - w_organization_social: publish posts and comments as the Page
  // - r_organization_social: read the Page's posts (post statistics)
  // No w_member_social: this provider never posts to a personal profile.
  override scopes = [
    'r_basicprofile',
    'rw_organization_admin',
    'w_organization_social',
    'r_organization_social',
  ];

  override editor = 'normal' as const;

  override async refreshToken(
    refresh_token: string
  ): Promise<AuthTokenDetails> {
    const {
      access_token: accessToken,
      expires_in,
      refresh_token: refreshToken,
    } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      })
    ).json();

    const { id, name, picture, username } = await this.basicProfile(
      accessToken
    );

    return {
      id,
      accessToken,
      refreshToken,
      expiresIn: expires_in,
      name,
      picture,
      username,
    };
  }

  // The connected member from r_basicprofile (/v2/userinfo needs openid /
  // profile, which the Community Management app doesn't have).
  private async basicProfile(accessToken: string) {
    const { id, localizedFirstName, localizedLastName, vanityName, ...me } =
      await (
        await fetch(
          'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,vanityName,profilePicture(displayImage~:playableStreams))',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )
      ).json();

    return {
      id: id as string,
      name: [localizedFirstName, localizedLastName].filter(Boolean).join(' '),
      picture:
        (me?.profilePicture?.['displayImage~']?.elements || []).slice(-1)?.[0]
          ?.identifiers?.[0]?.identifier || '',
      username: (vanityName as string) || '',
    };
  }

  override async generateAuthUrl() {
    const state = makeSecureId(6);
    const codeVerifier = makeSecureId(30);
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
      process.env.LINKEDIN_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/integrations/social/linkedin-page`
    )}&state=${state}&scope=${encodeURIComponent(this.scopes.join(' '))}`;
    return {
      url,
      codeVerifier,
      state,
    };
  }

  async companies(accessToken: string) {
    const { elements, ...all } = await (
      await fetch(
        'https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&state=APPROVED&projection=(elements*(role,organizationalTarget~(localizedName,vanityName,logoV2(original~:playableStreams))))',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202601',
          },
        }
      )
    ).json();

    return (elements || [])
      .filter(
        (e: any) =>
          e['organizationalTarget~'] &&
          ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR'].includes(e.role)
      )
      .map((e: any) => ({
        id: e.organizationalTarget.split(':').pop(),
        page: e.organizationalTarget.split(':').pop(),
        username: e['organizationalTarget~'].vanityName,
        name: e['organizationalTarget~'].localizedName,
        picture:
          e['organizationalTarget~'].logoV2?.['original~']?.elements?.[0]
            ?.identifiers?.[0]?.identifier,
      }));
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const information = await this.fetchPageInformation(accessToken, {
      page: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async fetchPageInformation(accessToken: string, params: { page: string }) {
    const pageId = params.page;
    const data = await (
      await fetch(
        `https://api.linkedin.com/v2/organizations/${pageId}?projection=(id,localizedName,vanityName,logoV2(original~:playableStreams))`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return {
      id: data.id,
      name: data.localizedName,
      access_token: accessToken,
      picture:
        data?.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0].identifier,
      username: data.vanityName,
    };
  }

  override async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/linkedin-page`
    );
    body.append('client_id', process.env.LINKEDIN_CLIENT_ID!);
    body.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET!);

    const {
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    } = await (
      await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const { id, name, picture, username } = await this.basicProfile(
      accessToken
    );

    return {
      // namespaced placeholder so the in-between row never collides with the
      // personal LinkedIn channel row (same org + same member id)
      id: `${this.identifier}_${id}`,
      accessToken,
      refreshToken,
      expiresIn,
      name,
      picture,
      username,
    };
  }

  override async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.post(id, accessToken, postDetails, integration, 'company');
  }

  // checkPostStatus / finalizePost are inherited as-is: the company context
  // travels inside pendingData (postType), set here once.
  override async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.postPending(
      id,
      accessToken,
      postDetails,
      integration,
      'company'
    );
  }

  override async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return super.comment(
      id,
      postId,
      lastCommentId,
      accessToken,
      postDetails,
      integration,
      'company'
    );
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const endDate = dayjs().unix() * 1000;
    const startDate = dayjs().subtract(date, 'days').unix() * 1000;

    const { elements }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationPageStatistics?q=organization&organization=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const { elements: elements2 }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const { elements: elements3 }: { elements: Root[]; paging: any } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
          `urn:li:organization:${id}`
        )}&timeIntervals=(timeRange:(start:${startDate},end:${endDate}),timeGranularityType:DAY)`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Linkedin-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      )
    ).json();

    const analytics = [...elements2, ...elements, ...elements3].reduce(
      (all, current) => {
        if (
          typeof current?.totalPageStatistics?.views?.allPageViews
            ?.pageViews !== 'undefined'
        ) {
          all['Page Views'].push({
            total: current.totalPageStatistics.views.allPageViews.pageViews,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (
          typeof current?.followerGains?.organicFollowerGain !== 'undefined'
        ) {
          all['Organic Followers'].push({
            total: current?.followerGains?.organicFollowerGain,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (typeof current?.followerGains?.paidFollowerGain !== 'undefined') {
          all['Paid Followers'].push({
            total: current?.followerGains?.paidFollowerGain,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        if (typeof current?.totalShareStatistics !== 'undefined') {
          all['Clicks'].push({
            total: current?.totalShareStatistics.clickCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Shares'].push({
            total: current?.totalShareStatistics.shareCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Engagement'].push({
            total: current?.totalShareStatistics.engagement,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });

          all['Comments'].push({
            total: current?.totalShareStatistics.commentCount,
            date: dayjs(current.timeRange.start).format('YYYY-MM-DD'),
          });
        }

        return all;
      },
      {
        'Page Views': [] as any[],
        Clicks: [] as any[],
        Shares: [] as any[],
        Engagement: [] as any[],
        Comments: [] as any[],
        'Organic Followers': [] as any[],
        'Paid Followers': [] as any[],
      }
    );

    return Object.keys(analytics).map((key) => ({
      label: key,
      data: analytics[
        key as 'Page Views' | 'Organic Followers' | 'Paid Followers'
      ],
      percentageChange: 5,
    }));
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    // Fetch lifetime share statistics for the specific post.
    // LinkedIn does not support time-bound statistics for specific share queries,
    // so no timeIntervals is sent and elements come back without a timeRange.
    const shareStatsUrl = `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(
      `urn:li:organization:${integrationId}`
    )}&shares=List(${encodeURIComponent(postId)})`;

    const { elements: shareElements }: { elements: PostShareStatElement[] } =
      await (
        await fetch(shareStatsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        })
      ).json();

    // Also fetch social actions (likes, comments, shares) for the specific post
    let socialActions: SocialActionsResponse | null = null;
    try {
      const socialActionsUrl = `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(
        postId
      )}`;
      socialActions = await (
        await fetch(socialActionsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': '202601',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        })
      ).json();
    } catch (e) {
      // Social actions may not be available for all posts
    }

    // Process share statistics into time series data
    const analytics = (shareElements || []).reduce(
      (all, current) => {
        if (typeof current?.totalShareStatistics !== 'undefined') {
          const dateStr = dayjs(current.timeRange?.start).format('YYYY-MM-DD');

          all['Impressions'].push({
            total: current.totalShareStatistics.impressionCount || 0,
            date: dateStr,
          });

          all['Unique Impressions'].push({
            total: current.totalShareStatistics.uniqueImpressionsCount || 0,
            date: dateStr,
          });

          all['Clicks'].push({
            total: current.totalShareStatistics.clickCount || 0,
            date: dateStr,
          });

          all['Likes'].push({
            total: current.totalShareStatistics.likeCount || 0,
            date: dateStr,
          });

          all['Comments'].push({
            total: current.totalShareStatistics.commentCount || 0,
            date: dateStr,
          });

          all['Shares'].push({
            total: current.totalShareStatistics.shareCount || 0,
            date: dateStr,
          });

          all['Engagement'].push({
            total: current.totalShareStatistics.engagement || 0,
            date: dateStr,
          });
        }
        return all;
      },
      {
        Impressions: [] as { total: number; date: string }[],
        'Unique Impressions': [] as { total: number; date: string }[],
        Clicks: [] as { total: number; date: string }[],
        Likes: [] as { total: number; date: string }[],
        Comments: [] as { total: number; date: string }[],
        Shares: [] as { total: number; date: string }[],
        Engagement: [] as { total: number; date: string }[],
      }
    );

    // If no time series data but we have social actions, create a single data point
    if (
      Object.values(analytics).every((arr) => arr.length === 0) &&
      socialActions
    ) {
      const today = dayjs().format('YYYY-MM-DD');
      analytics['Likes'].push({
        total: socialActions.likesSummary?.totalLikes || 0,
        date: today,
      });
      analytics['Comments'].push({
        total: socialActions.commentsSummary?.totalFirstLevelComments || 0,
        date: today,
      });
    }

    // Filter out empty analytics
    const result = Object.entries(analytics)
      .filter(([_, data]) => data.length > 0)
      .map(([label, data]) => ({
        label,
        data,
        percentageChange: 0,
      }));

    return result as any;
  }

  // "Auto Repost Posts" (linkedin-page-autoRepostPost) and "Auto plug post"
  // (linkedin-page-autoPlugPost) were removed: automated reposts and comments
  // are not part of the approved Page Management use case. Plugs already
  // saved for them are skipped by processPlugs.

  // Organization lookups are Community Management API calls, so mentions of
  // companies live on the Page provider only.
  async company(token: string, data: { url: string }) {
    const { url } = data;
    const getCompanyVanity = url.match(
      /^https?:\/\/(?:www\.)?linkedin\.com\/company\/([^/]+)\/?$/
    );
    if (!getCompanyVanity || !getCompanyVanity?.length) {
      throw new Error('Invalid LinkedIn company URL');
    }

    const { elements } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${getCompanyVanity[1]}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202601',
            Authorization: `Bearer ${token}`,
          },
        }
      )
    ).json();

    return {
      options: elements.map((e: { localizedName: string; id: string }) => ({
        label: e.localizedName,
        value: `@[${e.localizedName}](urn:li:organization:${e.id})`,
      }))?.[0],
    };
  }

  override async mention(token: string, data: { query: string }) {
    const { elements } = await (
      await fetch(
        `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${encodeURIComponent(
          data.query
        )}&projection=(elements*(id,localizedName,logoV2(original~:playableStreams)))`,
        {
          headers: {
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
            'LinkedIn-Version': '202601',
            Authorization: `Bearer ${token}`,
          },
        }
      )
    ).json();

    return elements.map((p: any) => ({
      id: String(p.id),
      label: p.localizedName,
      image:
        p.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier ||
        '',
    }));
  }

  mentionFormat(idOrHandle: string, name: string) {
    return `@[${name.replace('@', '')}](urn:li:organization:${idOrHandle})`;
  }
}

export interface Root {
  pageStatisticsByIndustryV2: any[];
  pageStatisticsBySeniority: any[];
  organization: string;
  pageStatisticsByGeoCountry: any[];
  pageStatisticsByTargetedContent: any[];
  totalPageStatistics: TotalPageStatistics;
  pageStatisticsByStaffCountRange: any[];
  pageStatisticsByFunction: any[];
  pageStatisticsByGeo: any[];
  followerGains: { organicFollowerGain: number; paidFollowerGain: number };
  timeRange: TimeRange;
  totalShareStatistics: {
    uniqueImpressionsCount: number;
    shareCount: number;
    engagement: number;
    clickCount: number;
    likeCount: number;
    impressionCount: number;
    commentCount: number;
  };
}

export interface TotalPageStatistics {
  clicks: Clicks;
  views: Views;
}

export interface Clicks {
  mobileCustomButtonClickCounts: any[];
  desktopCustomButtonClickCounts: any[];
}

export interface Views {
  mobileProductsPageViews: MobileProductsPageViews;
  allDesktopPageViews: AllDesktopPageViews;
  insightsPageViews: InsightsPageViews;
  mobileAboutPageViews: MobileAboutPageViews;
  allMobilePageViews: AllMobilePageViews;
  productsPageViews: ProductsPageViews;
  desktopProductsPageViews: DesktopProductsPageViews;
  jobsPageViews: JobsPageViews;
  peoplePageViews: PeoplePageViews;
  overviewPageViews: OverviewPageViews;
  mobileOverviewPageViews: MobileOverviewPageViews;
  lifeAtPageViews: LifeAtPageViews;
  desktopOverviewPageViews: DesktopOverviewPageViews;
  mobileCareersPageViews: MobileCareersPageViews;
  allPageViews: AllPageViews;
  careersPageViews: CareersPageViews;
  mobileJobsPageViews: MobileJobsPageViews;
  mobileLifeAtPageViews: MobileLifeAtPageViews;
  desktopJobsPageViews: DesktopJobsPageViews;
  desktopPeoplePageViews: DesktopPeoplePageViews;
  aboutPageViews: AboutPageViews;
  desktopAboutPageViews: DesktopAboutPageViews;
  mobilePeoplePageViews: MobilePeoplePageViews;
  desktopCareersPageViews: DesktopCareersPageViews;
  desktopInsightsPageViews: DesktopInsightsPageViews;
  desktopLifeAtPageViews: DesktopLifeAtPageViews;
  mobileInsightsPageViews: MobileInsightsPageViews;
}

export interface MobileProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllDesktopPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface InsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileAboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllMobilePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface ProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopProductsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface JobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface PeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface OverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileOverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface LifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopOverviewPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileCareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AllPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface CareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileJobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileLifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopJobsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopPeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface AboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopAboutPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobilePeoplePageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopCareersPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopInsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface DesktopLifeAtPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface MobileInsightsPageViews {
  pageViews: number;
  uniquePageViews: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

// Post analytics interfaces
export interface PostShareStatElement {
  organizationalEntity: string;
  share: string;
  totalShareStatistics: {
    uniqueImpressionsCount: number;
    shareCount: number;
    engagement: number;
    clickCount: number;
    likeCount: number;
    impressionCount: number;
    commentCount: number;
  };
  timeRange?: TimeRange;
}

export interface SocialActionsResponse {
  likesSummary?: {
    totalLikes: number;
    likedByCurrentUser: boolean;
  };
  commentsSummary?: {
    totalFirstLevelComments: number;
    commentsState: string;
  };
}

import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class BestTimeToPostTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'bestTimeToPostTool';

  run() {
    return createTool({
      id: 'bestTimeToPostTool',
      description: `Suggest the best days and hours to post, from the engagement of the organization's own posts published in the last 30 or 90 days (up to the 30 most recent ones, leaving out the last 2 days that are still collecting engagement, and the channels that don't provide post statistics).
Every post is compared to the average post of its channel, and the publishing slots (weekday + hour, in UTC) are ranked by how well their posts did: a score above 1 means better than average.
Convert the UTC hours to the user's timezone before showing them, and mention how many posts the suggestion is based on - with only a few analyzed posts it is a rough hint, not a rule.
When analyzedPosts is 0 there is not enough data yet (no published posts with analytics in the period).
Optionally pass channel ids (from integrationList) or a group id (from groupList) to limit the analysis.`,
      mcp: {
        annotations: {
          title: 'Suggest Best Time to Post',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        days: z
          .enum(['30', '90'])
          .describe('How far back to look at published posts: 30 or 90 days'),
        integrations: z
          .array(z.string())
          .max(20)
          .optional()
          .describe(
            'Optional channel ids from the integrationList tool, all channels when not passed'
          ),
        group: z
          .string()
          .optional()
          .describe(
            'Optional group (customer) id from the groupList tool to only analyze its channels'
          ),
      }),
      outputSchema: z.object({
        output: z.object({
          analyzedPosts: z
            .number()
            .describe('Number of published posts the suggestion is based on'),
          timezone: z.string(),
          slots: z.array(
            z.object({
              day: z.string().describe('Weekday, in UTC'),
              hour: z.number().describe('Hour of the day (0-23), in UTC'),
              posts: z.number().describe('Analyzed posts published in this slot'),
              score: z
                .number()
                .describe(
                  'Engagement of the slot compared to the average post of the channel, 1 is average'
                ),
            })
          ),
        }),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const { analyzedPosts, slots } =
          await this._postsService.bestTimesToPost(
            organizationId,
            Number(inputData.days),
            {
              customer: inputData.group,
              integrations: inputData.integrations,
            }
          );

        return {
          output: {
            analyzedPosts,
            timezone: 'UTC',
            slots,
          },
        };
      },
    });
  }
}

import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class AnalyticsSummaryTool implements AgentToolInterface {
  constructor(private _integrationService: IntegrationService) {}
  name = 'analyticsSummaryTool';

  run() {
    return createTool({
      id: 'analyticsSummaryTool',
      description: `Summarize the analytics of the connected channels (the same numbers as the Analytics page): followers, impressions, engagement and the other metrics each platform provides, for the last 7, 30 or 90 days.
Every metric has its total for the period and its percentage change compared to the previous period.
Optionally pass channel ids (from integrationList) or a group id (from groupList) to limit the summary.
Not every platform provides analytics: a channel without analytics comes back with an empty metrics list and a note.`,
      mcp: {
        annotations: {
          title: 'Get Analytics Summary',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        days: z
          .enum(['7', '30', '90'])
          .describe('Period to summarize: the last 7, 30 or 90 days'),
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
            'Optional group (customer) id from the groupList tool to only summarize its channels'
          ),
      }),
      outputSchema: z.object({
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            platform: z.string(),
            metrics: z.array(
              z.object({
                label: z.string(),
                total: z.number(),
                average: z
                  .boolean()
                  .describe(
                    'true when total is an average over the period (like a rate in %) instead of a sum'
                  ),
                percentageChange: z.number(),
              })
            ),
            note: z.string().optional(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        const channels = (
          await this._integrationService.getIntegrationsList(org.id)
        )
          .filter((p) => p.type === 'social')
          .filter(
            (p) =>
              !inputData.integrations?.length ||
              inputData.integrations.includes(p.id)
          )
          .filter((p) => !inputData.group || p.customer?.id === inputData.group);

        const summarize = async (p: (typeof channels)[number]) => {
          const channel = {
            id: p.id,
            name: p.customName || p.name,
            platform: p.providerIdentifier,
          };

          if (p.disabled) {
            return { ...channel, metrics: [], note: 'The channel is disabled' };
          }

          if (p.refreshNeeded || p.inBetweenSteps) {
            return {
              ...channel,
              metrics: [],
              note: 'The channel needs to be reconnected in PostCherry to load its analytics',
            };
          }

          try {
            const analytics = await this._integrationService.checkAnalytics(
              org,
              p.id,
              inputData.days
            );

            // same totals as the Analytics page: a sum over the period,
            // or an average for the metrics flagged as one
            const metrics = (analytics || []).map((metric) => {
              const average = !!metric.average;
              const sum = (metric.data || []).reduce(
                (all, current) => all + (Number(current.total) || 0),
                0
              );
              return {
                label: metric.label,
                total:
                  average && metric.data?.length
                    ? Number((sum / metric.data.length).toFixed(2))
                    : Math.round(sum),
                average,
                percentageChange: Number(metric.percentageChange) || 0,
              };
            });

            return {
              ...channel,
              metrics,
              ...(!metrics.length
                ? { note: 'No analytics are available for this channel' }
                : {}),
            };
          } catch (err) {
            return {
              ...channel,
              metrics: [],
              note: 'The analytics of this channel could not be loaded',
            };
          }
        };

        // a few channels at a time, every one of them calls its provider
        const output: Awaited<ReturnType<typeof summarize>>[] = [];
        for (let i = 0; i < channels.length; i += 5) {
          output.push(
            ...(await Promise.all(channels.slice(i, i + 5).map(summarize)))
          );
        }

        return { output };
      },
    });
  }
}

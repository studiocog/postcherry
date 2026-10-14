import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

const BrandVoicePrompt = z.object({
  voice: z
    .string()
    .describe('How to write like this brand, as instructions to a writer'),
  dos: z.array(z.string()).describe('Things the brand always does'),
  donts: z.array(z.string()).describe('Things the brand never does'),
});

const ClipsPrompt = z.object({
  clips: z.array(
    z.object({
      from: z.number().describe('Number of the first line of the clip'),
      to: z.number().describe('Number of the last line of the clip'),
      title: z.string().describe('Short title of the clip'),
      content: z
        .string()
        .describe('Social media post to publish the clip with, no hashtags'),
    })
  ),
});

// Limits are not part of the schemas, the planner checks every value afterwards
const PlanOutlinePrompt = z.object({
  items: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      time: z.string().describe('Local time HH:mm, 24 hours'),
      channels: z
        .array(z.number())
        .describe('Numbers of the channels from the list'),
      category: z
        .string()
        .describe('One of the content types from the list, or "other"'),
      title: z.string().describe('The idea of the post in one short sentence'),
    })
  ),
});

const PlanPostsPrompt = z.object({
  posts: z.array(
    z.object({
      number: z.number().describe('Number of the idea'),
      content: z.string().describe('The full social media post'),
    })
  ),
});

@Injectable()
export class OpenaiService {
  // The model answers with line numbers and not times, so a clip can only
  // start and end where the transcript really has a boundary
  async pickClips(
    title: string,
    language: string,
    segments: { start: number; end: number; text: string }[],
    maxClips: number,
    brandVoice = ''
  ) {
    const { clips } = (
      await openai.chat.completions.parse(
        {
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes the transcript of a video and picks the parts that will work best as short vertical clips for social media.
Every line of the transcript is "number [start seconds - end seconds] text".
Pick up to ${maxClips} clips, best first. A clip is a range of consecutive lines that starts with a hook, makes one complete point and is understandable without the rest of the video.
The length of a clip is the end of its last line minus the start of its first line: it must be between 20 and 90 seconds, never longer, so check the numbers before answering.
Clips must not overlap. Write the title and the post in this language, whatever the language of these instructions: ${language}.${
                brandVoice
                  ? '\nWrite the post text of every clip in this brand voice:\n' +
                    brandVoice
                  : ''
              }`,
            },
            {
              role: 'user',
              content: `title: ${title}\n\n${segments
                .map(
                  (p, index) =>
                    `${index} [${p.start.toFixed(1)} - ${p.end.toFixed(1)}] ${
                      p.text
                    }`
                )
                .join('\n')}`,
            },
          ],
          response_format: zodResponseFormat(ClipsPrompt, 'clipsPrompt'),
        },
        // shorter than the activity: an attempt that was given up on must not
        // still be running, and storing clips, when its retry gets there
        { timeout: 8 * 60 * 1000, maxRetries: 0 }
      )
    ).choices[0].message.parsed || { clips: [] };

    return clips;
  }

  async proposeBrandVoice(posts: string[]) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that reads social media posts written by one brand and describes its writing voice, so another writer can write new posts that sound the same.
Describe the tone, the personality, the audience, the typical length and the habits around emojis, hashtags and formatting.
voice: maximum 600 characters, written as instructions to the writer ("Write ...").
dos and donts: 3 to 7 short items each.
Answer in the language most of the posts are written in.`,
            },
            {
              role: 'user',
              content: posts
                .map((post, index) => `Post ${index + 1}:\n${post}`)
                .join('\n---\n'),
            },
          ],
          response_format: zodResponseFormat(BrandVoicePrompt, 'brandVoice'),
        })
      ).choices[0].message.parsed || { voice: '', dos: [], donts: [] }
    );
  }

  async generateImage(prompt: string, isVertical = false) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3.
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'chatgpt-image-latest',
        size: isVertical ? '1024x1536' : '1024x1024',
      })
    ).data[0];

    return generate.b64_json;
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-4.1',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(text: string) {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that takes a text and break it into slides, each slide should have an image prompt and voice text to be later used to generate a video and voice, image prompt should capture the essence of the slide and also have a back dark gradient on top, image prompt should not contain text in the picture, generate between 3-5 slides maximum`;
        const parse =
          (
            await openai.chat.completions.parse({
              model: 'gpt-4.1',
              messages: [
                {
                  role: 'system',
                  content: message,
                },
                {
                  role: 'user',
                  content: text,
                },
              ],
              response_format: zodResponseFormat(
                z.object({
                  slides: z
                    .array(
                      z.object({
                        imagePrompt: z.string(),
                        voiceText: z.string(),
                      })
                    )
                    .describe('an array of slides'),
                }),
                'slides'
              ),
            })
          ).choices[0].message.parsed?.slides || [];

        return parse;
      } catch (err) {
        console.log(err);
      }
    }

    return [];
  }

  // The model answers with channel numbers and never with ids, so it can only
  // pick channels from the list it was given
  async planContentOutline(
    input: {
      startDate: string;
      endDate: string;
      total: number;
      postsPerWeek: number;
      channels: {
        number: number;
        name: string;
        identifier: string;
        maxLength: number;
      }[];
      // every content type a post can have, and the ones the user picked
      categories: string[];
      contentMix: string[];
      language: string;
      goals: string;
      brandContext: string;
    },
    signal?: AbortSignal
  ) {
    const channels = input.channels
      .map(
        (channel) =>
          `${channel.number}. ${channel.name} (${channel.identifier}, max ${channel.maxLength} characters)`
      )
      .join('\n');

    const contentMix = input.contentMix.length
      ? `Use only these content types: ${input.contentMix.join(', ')}.`
      : 'Use the content types that fit the goals best.';

    const system = `You plan the social media content calendar of one brand.
Plan exactly ${input.total} posts between ${input.startDate} and ${input.endDate} (both included), about ${input.postsPerWeek} per week, spread evenly over the period and never more than ${input.postsPerWeek} in any 7 days counted from ${input.startDate}.
Give every post a good local posting time (HH:mm, 24 hours).
Every post goes to one or more of these channels, use their numbers. Put a post on several channels only when the idea fits all of them:
${channels}
Give every post one content type from this list: ${input.categories.join(', ')}, or "other". ${contentMix}
Every idea must be different.
Write the titles in this language, whatever the language of these instructions: ${input.language}.`;

    return (
      (
        await openai.chat.completions.parse(
          {
            model: 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: input.brandContext
                  ? `${system}\n\n${input.brandContext}`
                  : system,
              },
              {
                role: 'user',
                content: `Goals and topics:\n${input.goals}`,
              },
            ],
            response_format: zodResponseFormat(
              PlanOutlinePrompt,
              'planOutline'
            ),
          },
          { timeout: 2 * 60 * 1000, maxRetries: 1, signal }
        )
      ).choices[0].message.parsed?.items || []
    );
  }

  async writePlannedPosts(
    input: {
      ideas: {
        number: number;
        date: string;
        title: string;
        category: string;
        channels: string;
        maxLength: number;
      }[];
      allTitles: string[];
      language: string;
      goals: string;
      brandContext: string;
    },
    signal?: AbortSignal
  ) {
    const system = `You write social media posts for a planned content calendar.
Write one complete post for every idea you are asked for, and answer with the number of the idea.
Each post must fit in its max characters. Plain text only, no markdown, line breaks are allowed.
Do not repeat what the other posts of the plan say, all the ideas of the plan are listed.
Write in this language, whatever the language of these instructions: ${input.language}.`;

    const allIdeas = input.allTitles.map((title) => `- ${title}`).join('\n');

    const ideas = input.ideas
      .map(
        (idea) =>
          `${idea.number}. [${idea.date}] ${idea.title} (type: ${idea.category}, channels: ${idea.channels}, max ${idea.maxLength} characters)`
      )
      .join('\n');

    return (
      (
        await openai.chat.completions.parse(
          {
            model: 'gpt-4.1',
            messages: [
              {
                role: 'system',
                content: input.brandContext
                  ? `${system}\n\n${input.brandContext}`
                  : system,
              },
              {
                role: 'user',
                content: `Goals and topics:\n${input.goals}\n\nAll ideas of the plan:\n${allIdeas}\n\nWrite these:\n${ideas}`,
              },
            ],
            response_format: zodResponseFormat(PlanPostsPrompt, 'plannedPosts'),
          },
          { timeout: 2 * 60 * 1000, maxRetries: 1, signal }
        )
      ).choices[0].message.parsed?.posts || []
    );
  }
}

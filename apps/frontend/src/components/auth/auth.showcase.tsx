'use client';

import { FC, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CherryMarkPaths } from '@gitroom/frontend/components/ui/cherry.mark';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Scene = {
  prompt: string;
  time: string;
  done: string;
  platforms: { id: string; name: string }[];
};

const scenes: Scene[] = [
  {
    prompt:
      'Post my new croissant photo on Instagram and TikTok tomorrow at 9am. Make it cozy ☕',
    time: 'Tue 09:00',
    done: 'Scheduled',
    platforms: [
      { id: 'instagram', name: 'Instagram' },
      { id: 'tiktok', name: 'TikTok' },
    ],
  },
  {
    prompt:
      'Turn my blog post into a LinkedIn post and an X thread for Monday morning',
    time: 'Mon 10:30',
    done: 'Scheduled',
    platforms: [
      { id: 'linkedin', name: 'LinkedIn' },
      { id: 'x', name: 'X' },
    ],
  },
  {
    prompt: 'Upload my vlog to YouTube on Friday and share it on Facebook',
    time: 'Fri 18:00',
    done: 'Scheduled',
    platforms: [
      { id: 'youtube', name: 'YouTube' },
      { id: 'facebook', name: 'Facebook' },
    ],
  },
  {
    prompt: 'Announce our summer sale on Threads, Bluesky and Telegram now 🍒',
    time: 'Now',
    done: 'Posted',
    platforms: [
      { id: 'threads', name: 'Threads' },
      { id: 'bluesky', name: 'Bluesky' },
      { id: 'telegram', name: 'Telegram' },
    ],
  },
];

const innerOrbit = ['instagram', 'tiktok', 'youtube', 'linkedin', 'x', 'facebook'];
const outerOrbit = [
  'threads',
  'pinterest',
  'bluesky',
  'telegram',
  'discord',
  'mastodon',
  'tumblr',
  'wordpress',
];

const Orbit: FC<{ items: string[]; radius: number; hot: string[]; reverse?: boolean }> = ({
  items,
  radius,
  hot,
  reverse,
}) => (
  <div
    className={clsx('pc-orbit', reverse && 'pc-orbit--reverse')}
    style={{ width: radius * 2, height: radius * 2 }}
  >
    {items.map((id, index) => {
      const angle = (360 / items.length) * index;
      return (
        <div
          key={id}
          className="pc-orbit__slot"
          style={{
            transform: `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`,
          }}
        >
          <div className={clsx('pc-orbit__icon', hot.includes(id) && 'is-hot')}>
            <img src={`/icons/platforms/${id}.png`} alt="" width={28} height={28} />
          </div>
        </div>
      );
    })}
  </div>
);

export const AuthShowcase: FC = () => {
  const t = useT();
  const [sceneIndex, setSceneIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [stage, setStage] = useState<'typing' | 'thinking' | 'tool' | 'out'>(
    'typing'
  );
  const [scheduled, setScheduled] = useState(0);
  const scene = scenes[sceneIndex];

  // Drive one scene: type the prompt, "think", schedule each platform, then move on
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(scene.prompt.length);
      setStage('tool');
      setScheduled(scene.platforms.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    if (stage === 'typing') {
      timer =
        typed < scene.prompt.length
          ? setTimeout(() => setTyped((value) => value + 1), 28)
          : setTimeout(() => setStage('thinking'), 350);
    } else if (stage === 'thinking') {
      timer = setTimeout(() => setStage('tool'), 900);
    } else if (stage === 'tool') {
      timer =
        scheduled < scene.platforms.length
          ? setTimeout(() => setScheduled((value) => value + 1), 450)
          : setTimeout(() => setStage('out'), 2400);
    } else {
      timer = setTimeout(() => {
        setSceneIndex((value) => (value + 1) % scenes.length);
        setTyped(0);
        setScheduled(0);
        setStage('typing');
      }, 450);
    }

    return () => clearTimeout(timer);
  }, [stage, typed, scheduled, scene]);

  const hot = scene.platforms.slice(0, scheduled).map((p) => p.id);

  return (
    <div className="pc-showcase relative flex-1 rounded-[12px] overflow-hidden flex flex-col items-center px-[32px] pt-[64px] pb-[40px]">
      <div className="pc-showcase__glow" aria-hidden="true" />
      <div className="pc-showcase__dots" aria-hidden="true" />

      <div className="relative text-center z-[1]">
        <div className="text-[44px] leading-[1.05] font-[600] -tracking-[1px]">
          {t('auth_showcase_title_1', 'Just say it.')}
          <br />
          <span className="pc-showcase__gradient italic">
            {t('auth_showcase_title_2', "We'll post it.")}
          </span>
        </div>
        <div className="text-[17px] mt-[14px] opacity-70 max-w-[460px] mx-auto">
          {t(
            'auth_showcase_subtitle',
            'Schedule to 30+ channels from PostCherry, or straight from Claude, ChatGPT and the AI apps you already use.'
          )}
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[460px] flex items-center justify-center z-[1]">
        <div className="pc-stage" aria-hidden="true">
          <Orbit items={outerOrbit} radius={205} hot={hot} reverse />
          <Orbit items={innerOrbit} radius={125} hot={hot} />
          <div className="pc-stage__core">
            <svg width="76" height="76" viewBox="0 0 60 60" fill="none">
              <CherryMarkPaths />
            </svg>
          </div>
        </div>

        <div
          className={clsx('pc-chat', stage === 'out' && 'pc-chat--out')}
          role="img"
          aria-label={t(
            'auth_showcase_chat_label',
            'Example: someone asks their AI assistant to post for them, and PostCherry schedules it.'
          )}
        >
          <div className="pc-chat__bar">
            <span className="pc-chat__dot" />
            {t('auth_showcase_assistant', 'Your AI assistant')}
            <span className="pc-chat__badge">🍒 PostCherry</span>
          </div>
          <div className="pc-chat__msg">
            {scene.prompt.slice(0, typed)}
            {stage === 'typing' && <span className="pc-chat__caret" />}
          </div>
          {stage === 'thinking' && (
            <div className="pc-chat__thinking">
              <i />
              <i />
              <i />
            </div>
          )}
          {(stage === 'tool' || stage === 'out') && (
            <div className="pc-chat__tool">
              <div className="pc-chat__tool-head">
                🍒 PostCherry <code>schedule_post</code>
              </div>
              {scene.platforms.map((platform, index) => (
                <div key={platform.id} className="pc-chat__row">
                  <img
                    src={`/icons/platforms/${platform.id}.png`}
                    alt=""
                    width={18}
                    height={18}
                  />
                  <span className="flex-1">{platform.name}</span>
                  <span className="opacity-60">{scene.time}</span>
                  <b className={clsx(index < scheduled && 'is-done')}>
                    {index < scheduled ? `✓ ${scene.done}` : '…'}
                  </b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

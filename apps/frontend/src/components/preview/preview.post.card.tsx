import { FC, ReactNode } from 'react';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';

export interface PreviewIntegration {
  name: string;
  picture: string;
  providerIdentifier: string;
  profile: string;
}

// One post of a public preview: the channel, the content and the media.
// No hooks, so server pages and client components can both render it.
export const PreviewPostCard: FC<{
  integration: PreviewIntegration;
  badge?: ReactNode;
  media: { path: string; name?: string }[];
  children: ReactNode;
}> = ({ integration, badge, media, children }) => {
  return (
    <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[20px]">
      <div className="flex gap-[12px]">
        <div>
          <div className="flex shrink-0 rounded-full relative">
            <div className="w-[50px] h-[50px] z-[20]">
              <img
                className="w-full h-full relative z-[20] bg-newBgColor aspect-square rounded-full"
                alt={integration.name}
                src={integration.picture}
              />
            </div>
            <div className="absolute -end-[5px] -bottom-[5px] w-[24px] h-[24px] z-[20]">
              <img
                className="w-full h-full bg-newBgColor aspect-square rounded-full"
                alt={integration.providerIdentifier}
                src={`/icons/platforms/${integration.providerIdentifier}.png`}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-[8px] min-w-0">
          <div className="flex items-center gap-[8px]">
            <h2 className="text-[14px] font-[600]">{integration.name}</h2>
            <span className="text-[14px] text-textItemBlur">
              @{integration.profile}
            </span>
            {badge}
          </div>
          <div className="flex flex-col gap-[16px]">
            {children}
            {!!media.length && (
              <div className="flex w-full gap-[10px]">
                {media.map((p, index) => (
                  <div
                    key={p.name || index}
                    className="flex-1 rounded-[10px] max-h-[500px] overflow-hidden"
                  >
                    <VideoOrImage
                      isContain={true}
                      src={p.path}
                      autoplay={true}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

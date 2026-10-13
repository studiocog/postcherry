'use client';

import { CherryMarkPaths } from '@gitroom/frontend/components/ui/cherry.mark';

export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      <CherryMarkPaths />
    </svg>
  );
};

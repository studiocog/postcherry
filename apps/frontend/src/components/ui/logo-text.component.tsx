import React from 'react';
import { CherryMarkPaths } from '@gitroom/frontend/components/ui/cherry.mark';

export const LogoTextComponent = () => {
  return (
    <svg
      width="150"
      height="33"
      viewBox="0 0 150 33"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="scale(0.55)">
        <CherryMarkPaths />
      </g>
      <text
        x="36"
        y="23.5"
        fontSize="20"
        fontWeight="700"
        letterSpacing="-0.3"
        fill="currentColor"
      >
        Post<tspan fill="#D21F3C">Cherry</tspan>
      </text>
    </svg>
  );
};

'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
  // 'rail' = icon above label (mobile drawer), 'bar' = icon + label in the top bar,
  // 'icon' = icon only in the top bar
  variant?: 'rail' | 'bar' | 'icon';
}> = ({ label, icon, path, onClick, variant = 'rail' }) => {
  const currentPath = usePathname();
  const isActive = currentPath.indexOf(path) === 0;

  const className = clsx(
    variant === 'rail' &&
      'group w-full minCustom:h-[54px] custom:h-[44px] py-[8px] px-[6px] minCustom:gap-[4px] custom:gap-[2px] flex flex-col font-[600] items-center justify-center rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused transition-colors',
    variant === 'rail' &&
      (isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'),
    variant === 'bar' &&
      'group h-[44px] px-[16px] iconBreak:px-[10px] gap-[8px] flex items-center font-[600] text-[15px] whitespace-nowrap rounded-[10px] transition-colors',
    variant === 'icon' &&
      'group w-[38px] h-[38px] flex items-center justify-center rounded-[10px] transition-colors',
    variant !== 'rail' &&
      (isActive
        ? 'text-white bg-white/[0.12]'
        : 'text-white/70 hover:text-white hover:bg-white/[0.08]')
  );

  const inner =
    variant === 'rail' ? (
      <>
        <div className="custom:scale-90 transition-transform">{icon}</div>
        <div className="custom:text-[9px] minCustom:text-[10px] leading-[1.1] text-center">
          {label}
        </div>
      </>
    ) : variant === 'bar' ? (
      <>
        <div className="scale-[0.8] flex">{icon}</div>
        {/* narrow desktops keep the icon, the label is in the tooltip */}
        <span className="maxMedia:hidden">{label}</span>
      </>
    ) : (
      <div className="scale-[0.75] flex">{icon}</div>
    );

  if (onClick) {
    return (
      <button onClick={onClick} title={label} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      title={label}
      {...path.indexOf('http') === 0 && { target: '_blank' }}
      className={className}
    >
      {inner}
    </Link>
  );
};

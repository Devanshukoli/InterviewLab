import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
  alt?: string;
}

export default function AppLogo({
  size = 28,
  className = '',
  alt = 'InterviewLab',
}: AppLogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt={alt}
      className={`rounded-[22%] shrink-0 object-cover ${className}`}
    />
  );
}

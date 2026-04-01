import React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function IconBase({ children, viewBox = "0 0 24 24", ...props }: IconProps) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BrandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 18.5 7v10L12 20.5 5.5 17V7L12 3.5Z" />
      <path d="m12 7.2 3.2 2v4.7L12 16l-3.2-2.1V9.2L12 7.2Z" />
      <path d="m10.2 12 1.3 1.3 2.5-2.8" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="m16 16 3.75 3.75" />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 18h6" />
      <path d="M10.5 20a1.75 1.75 0 0 0 3 0" />
      <path d="M6.5 16.5c1-.9 1.5-2.3 1.5-4.3V10a4 4 0 1 1 8 0v2.2c0 2 .5 3.4 1.5 4.3" />
    </IconBase>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.8c2.3 2.1 3.7 5 3.7 8.2S14.3 18.1 12 20.2C9.7 18.1 8.3 15.2 8.3 12S9.7 5.9 12 3.8Z" />
    </IconBase>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.5 7.25A2.75 2.75 0 0 1 8.25 4.5h8.5a2 2 0 0 1 2 2v1.25H8.5a2.5 2.5 0 1 0 0 5h10.25v4a2 2 0 0 1-2 2h-8.5A2.75 2.75 0 0 1 5.5 16V7.25Z" />
      <path d="M18.75 7.75v5H8.5a2.5 2.5 0 1 1 0-5h10.25Z" />
      <circle cx="15.75" cy="10.25" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3.5 1.3 3.2L16.5 8l-3.2 1.3L12 12.5l-1.3-3.2L7.5 8l3.2-1.3L12 3.5Z" />
      <path d="m18 12.5.85 2.15L21 15.5l-2.15.85L18 18.5l-.85-2.15L15 15.5l2.15-.85L18 12.5Z" />
      <path d="m6.2 13.7.75 1.8 1.8.75-1.8.75-.75 1.8-.75-1.8-1.8-.75 1.8-.75.75-1.8Z" />
    </IconBase>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4.5 10.5 7.5-6 7.5 6" />
      <path d="M7 9.75v9h10v-9" />
      <path d="M10 18.75v-5h4v5" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 6 6v5c0 4.2 2.4 7.4 6 9.5 3.6-2.1 6-5.3 6-9.5V6l-6-2.5Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </IconBase>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4.25" y="4.25" width="5.5" height="5.5" rx="1.5" />
      <rect x="14.25" y="4.25" width="5.5" height="5.5" rx="1.5" />
      <rect x="4.25" y="14.25" width="5.5" height="5.5" rx="1.5" />
      <rect x="14.25" y="14.25" width="5.5" height="5.5" rx="1.5" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.6 12.1 2.2 2.25 4.65-4.95" />
    </IconBase>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="16.2" r="0.85" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6.5 9.25 5.5 5.5 5.5-5.5" />
    </IconBase>
  );
}

export function ArrowRightUpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 17 17 7" />
      <path d="M9.5 7H17v7.5" />
    </IconBase>
  );
}

export function SnowflakeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.25v17.5" />
      <path d="m7 6.3 10 11.4" />
      <path d="m17 6.3-10 11.4" />
      <path d="M3.75 12h16.5" />
    </IconBase>
  );
}

export function ArrowDownCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v7" />
      <path d="m8.75 11.75 3.25 3.25 3.25-3.25" />
    </IconBase>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8.25" r="3.25" />
      <path d="M5.5 18c1.7-2.5 3.9-3.75 6.5-3.75S16.8 15.5 18.5 18" />
    </IconBase>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 5H7.75A2.75 2.75 0 0 0 5 7.75v8.5A2.75 2.75 0 0 0 7.75 19H10" />
      <path d="M14 8.5 18 12l-4 3.5" />
      <path d="M18 12H9.5" />
    </IconBase>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="6" width="15" height="12" rx="2.5" />
      <path d="m5.75 8 6.25 4.75L18.25 8" />
    </IconBase>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" />
      <path d="M8.5 10.5V8.25a3.5 3.5 0 1 1 7 0v2.25" />
    </IconBase>
  );
}

export function GoogleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19.5 12.2c0-.55-.05-1.05-.15-1.55H12v3.15h4.2c-.2 1.05-.8 1.95-1.7 2.55v2.6h2.95c1.7-1.55 2.7-3.8 2.7-6.75Z" />
      <path d="M12 20c2.15 0 3.95-.7 5.25-1.9l-2.95-2.6c-.8.55-1.8.9-3 .9-2.3 0-4.2-1.55-4.9-3.65H3.35v2.7A8 8 0 0 0 12 20Z" />
      <path d="M6.4 12.75a4.8 4.8 0 0 1 0-1.5V8.55H3.35a8 8 0 0 0 0 6.9l3.05-2.7Z" />
      <path d="M12 7.6c1.3 0 2.45.45 3.35 1.3l2.5-2.5C16.25 4.95 14.3 4 12 4a8 8 0 0 0-8.65 4.55l3.05 2.7C7.1 9.15 9 7.6 12 7.6Z" />
    </IconBase>
  );
}

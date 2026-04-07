import React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function IconBase({ children, viewBox = "0 0 24 24", ...props }: IconProps) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
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
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="5" y="5" width="54" height="54" rx="16" fill="#111827" />
      <path
        d="M18 46.5 28.8 18h6.4L46 46.5h-7.1l-2.2-6.2H27.2L25 46.5H18Z"
        fill="#F8FAFC"
      />
      <path
        d="M29.8 34.8h4.4l-2.2-6.4-2.2 6.4Z"
        fill="#111827"
      />
      <path
        d="M31.8 17.8 43 46.5h3L34.9 17.8h-3.1Z"
        fill="#8FB7FF"
        fillOpacity=".24"
      />
    </svg>
  );
}

export function GoogleLogoIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.6 12.23c0-.72-.06-1.25-.19-1.8H12v3.42h5.52c-.11.85-.72 2.14-2.07 3l-.02.11 2.79 2.12.19.02c1.74-1.58 2.75-3.91 2.75-6.87Z" fill="#4285F4" />
      <path d="M12 21.9c2.7 0 4.97-.87 6.63-2.36l-3.16-2.42c-.84.58-1.97.98-3.47.98-2.64 0-4.88-1.71-5.68-4.07l-.11.01-2.9 2.2-.04.1c1.65 3.19 5.02 5.56 8.73 5.56Z" fill="#34A853" />
      <path d="M6.32 14.03A5.74 5.74 0 0 1 6 12c0-.7.12-1.37.31-2.03l-.01-.14-2.94-2.24-.1.05A9.72 9.72 0 0 0 2.4 12c0 1.56.37 3.03 1.02 4.35l2.9-2.32Z" fill="#FBBC05" />
      <path d="M12 5.9c1.9 0 3.18.8 3.9 1.46l2.84-2.72C16.95 3 14.7 2.1 12 2.1c-3.7 0-7.08 2.37-8.73 5.56l3.05 2.33c.82-2.36 3.05-4.08 5.68-4.08Z" fill="#EA4335" />
    </svg>
  );
}

export function GitHubLogoIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M12 2.4a9.6 9.6 0 0 0-3.04 18.7c.48.09.66-.2.66-.46v-1.78c-2.7.57-3.27-1.14-3.27-1.14-.45-1.11-1.08-1.4-1.08-1.4-.88-.58.06-.57.06-.57.98.07 1.5 1 1.5 1 .86 1.46 2.27 1.04 2.82.8.09-.61.34-1.03.62-1.27-2.15-.24-4.41-1.05-4.41-4.69 0-1.04.38-1.89 1-2.56-.1-.25-.43-1.22.1-2.54 0 0 .83-.26 2.64.98a9.8 9.8 0 0 1 4.8 0c1.81-1.24 2.64-.98 2.64-.98.53 1.32.2 2.29.1 2.54.63.67 1 1.52 1 2.56 0 3.65-2.26 4.45-4.42 4.68.35.29.66.85.66 1.72v2.54c0 .26.17.56.67.46A9.6 9.6 0 0 0 12 2.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0" />
      <path d="m15 15 6 6" />
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
      <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </IconBase>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
      <path d="M3.6 9h16.8" />
      <path d="M3.6 15h16.8" />
      <path d="M11.5 3a17 17 0 0 0 0 18" />
      <path d="M12.5 3a17 17 0 0 1 0 18" />
    </IconBase>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M17 8V5a1 1 0 0 0-1-1H6a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3" />
      <path d="M17 16v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6" />
      <path d="M20 12v4h-4a2 2 0 0 1 0-4z" />
    </IconBase>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2" />
      <path d="M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2" />
      <path d="M9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6" />
    </IconBase>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12H3l9-9l9 9h-2" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      <path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
    </IconBase>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function AlertCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
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
      <path d="m10 4 2 1 2-1" />
      <path d="M12 2v6.5l3 1.72" />
      <path d="m17.928 6.268.134 2.232 1.866 1.232" />
      <path d="m20.66 7-5.629 3.25.01 3.458" />
      <path d="m19.928 14.268-1.866 1.232-.134 2.232" />
      <path d="m20.66 17-5.629-3.25-2.99 1.738" />
      <path d="m14 20-2-1-2 1" />
      <path d="M12 22v-6.5l-3-1.72" />
      <path d="M6.072 17.732 5.938 15.5l-1.866-1.232" />
      <path d="m3.34 17 5.629-3.25-.01-3.458" />
      <path d="M4.072 9.732 5.938 8.5l.134-2.232" />
      <path d="m3.34 7 5.629 3.25 2.99-1.738" />
    </IconBase>
  );
}

export function ArrowDownCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0-18 0" />
      <path d="m8 12 4 4" />
      <path d="M12 8v8" />
      <path d="m16 12-4 4" />
    </IconBase>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0" />
      <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </IconBase>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
      <path d="M9 12h12" />
      <path d="m18 9 3 3-3 3" />
    </IconBase>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </IconBase>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
      <path d="M12 16h.01" />
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

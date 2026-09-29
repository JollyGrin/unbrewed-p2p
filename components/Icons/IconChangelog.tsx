import { Icon, IconProps } from "@chakra-ui/react";

/** Small list icon for the "What's new" nav link (Main.dc.html mockup). */
export const IconChangelog = (props: IconProps) => {
  return (
    <Icon
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h4" />
    </Icon>
  );
};

import styled from "@emotion/styled";
import { HStack } from "@chakra-ui/react";
import { IconLogo } from "../Icons/IconLogo";
import Link from "next/link";

import { FaDiscord } from "react-icons/fa";
import { GiSwapBag } from "react-icons/gi";
import { FaGithub } from "react-icons/fa";
import { FaYoutube } from "react-icons/fa";
import { IconType } from "react-icons";

export const Navbar = () => {
  return (
    <HStack p="0.75rem 0.5rem" justifyContent="space-between">
      <Link href="/">
        <IconLogo fontSize="2rem" />
      </Link>

      <HStack>
        <Link href="/bag">
          <BagIcon />
        </Link>
        <Link href="https://discord.gg/qPxHFjwkNN">
          <DiscordIcon />
        </Link>
        <Link href="https://youtube.com/playlist?list=PLjsjwAfJTj3a2NMDzOENFMwOYUzsFQn_C&si=Wi-MwpmS6loyBpB3">
          <YoutubeIcon />
        </Link>
        <Link href="https://github.com/jollygrin/unbrewed-p2p/">
          <GithubIcon />
        </Link>
      </HStack>
    </HStack>
  );
};

const iconProps = `
  font-size: 2rem;
  transition: all 0.25s ease-in-out;
  :hover {
    filter: saturate(2);
    transform: scale(1.2);
  }

  :active {
    transform: scale(1.1);
  }
`;
function i(icon: IconType) {
  return styled(icon)(iconProps);
}
const BagIcon = i(GiSwapBag);
const DiscordIcon = i(FaDiscord);
const GithubIcon = i(FaGithub);
const YoutubeIcon = i(FaYoutube);

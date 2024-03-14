import styled from "@emotion/styled";
import { HStack } from "@chakra-ui/react";
import { IconLogo } from "../Icons/IconLogo";
import Link from "next/link";

import { FaDiscord } from "react-icons/fa";
import { GiSwapBag } from "react-icons/gi";
import { IconType } from "react-icons";
import { colors } from "@/styles/style";

export const Navbar = () => {
  return (
    <HStack p="0.75rem 0.5rem" justifyContent="space-between">
      <Link href="/">
        <IconLogo fontSize="2rem" />
      </Link>

      <HStack>
        <Link href="https://discord.gg/qPxHFjwkNN">
          <DiscordIcon />
        </Link>
        <Link href="/bag">
          <BagIcon />
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

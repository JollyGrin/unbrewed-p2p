import { Flex, Text } from "@chakra-ui/react";
import useTranslation from "next-translate/useTranslation";

const Homepage = () => {
  const { t, lang } = useTranslation("common");

  return (
    <Flex>
      <Text>Hello</Text>
      <Text>{t("hero.oneliner")}</Text>
    </Flex>
  );
};

export default Homepage;

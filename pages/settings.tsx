import { SettingsContainer } from "@/components/Settings/settings.container";
import { PageSeo } from "@/components/Helmet/Head";
import { useLocalServerStorage } from "@/lib/hooks";

const SettingsPage: React.FC = () => {
  const { activeServer, serverList, setActiveServer } = useLocalServerStorage();
  return (
    <>
      <PageSeo path="/settings" title="Settings — Unbrewed" noindex />
      <SettingsContainer
        activeServer={activeServer}
        serverList={serverList}
        setActiveServer={setActiveServer}
      />
    </>
  );
};

export default SettingsPage;

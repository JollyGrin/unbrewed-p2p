import { SettingsContainer } from "@/components/Settings/settings.container";
import { useLocalServerStorage } from "@/lib/hooks";

const SettingsPage: React.FC = () => {
  const { activeServer, serverList, setActiveServer } = useLocalServerStorage();
  return (
    <SettingsContainer
      activeServer={activeServer}
      serverList={serverList}
      setActiveServer={setActiveServer}
    />
  );
};

export default SettingsPage;

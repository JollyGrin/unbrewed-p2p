import { JoinPage } from "@/components/Join";
import { PageSeo } from "@/components/Helmet/Head";

export default function JoinGamePage() {
  return (
    <>
      <PageSeo
        path="/join"
        title="You're Invited — Join an Unmatched Game | Unbrewed"
        description="A friend saved you a seat at their Unmatched table. Click to grab a deck and jump straight into their game — free, in your browser, no account needed."
        image="/og-join.jpg"
      />
      <JoinPage />
    </>
  );
}

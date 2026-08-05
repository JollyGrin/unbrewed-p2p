import { AccountPage } from "@/components/Account/AccountPage";

/**
 * `/account` is a FIXED route — no dynamic segment — so the static export emits
 * a real `account.html` and none of the 404-rescue dance the share pages need
 * (pages/404.tsx) applies here.
 */
export default function Account() {
  return <AccountPage />;
}

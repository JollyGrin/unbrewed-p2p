import { CollectionPage } from "@/components/Collection/CollectionPage";

/**
 * `/collection` is a FIXED route — no dynamic segment — so the static export
 * emits a real `collection.html` and none of the 404-rescue dance the share
 * pages need (pages/404.tsx) applies here. Same shape as /account.
 */
export default function Collection() {
  return <CollectionPage />;
}

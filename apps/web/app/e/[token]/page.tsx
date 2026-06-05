import { EndUserChatPage } from "@aicortex/views/enduser/public";

export default async function EndUserPublicChatRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EndUserChatPage token={token} />;
}

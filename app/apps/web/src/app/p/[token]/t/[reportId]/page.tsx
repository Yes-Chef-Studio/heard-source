import { SharedTicketView } from "../../_components/shared-ticket-view"

export default async function SharedTicketPage({
  params,
}: {
  params: Promise<{ token: string; reportId: string }>
}) {
  const { token, reportId } = await params
  return <SharedTicketView reportId={reportId} token={token} />
}

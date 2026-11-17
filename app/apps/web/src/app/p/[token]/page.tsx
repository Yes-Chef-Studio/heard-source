import { SharedProjectView } from "./_components/shared-project-view"

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <SharedProjectView token={token} />
}

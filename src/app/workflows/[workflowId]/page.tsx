import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  return <WorkflowBuilder workflowId={workflowId} />;
}


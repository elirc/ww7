/**
 * What this file does:
 * Seeds a minimal set of users and sample workflows for local exploration.
 * What calls it:
 * The `npm run db:seed` script in package.json.
 * What it calls:
 * Prisma client writes plus the password helper in src/lib/auth/password.ts.
 * One thing a junior engineer would likely get wrong:
 * Seeding plaintext passwords or skipping idempotency, which makes local setup flaky and unsafe.
 */
import {
  PrismaClient,
  UserRole,
  WorkflowStatus,
  WorkflowTriggerType,
  WorkflowStepActionType,
} from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await hashPassword("admin1234");
  const operatorPassword = await hashPassword("operator1234");
  const analystPassword = await hashPassword("analyst1234");

  const admin = await prisma.user.upsert({
    where: { email: "admin@flowforge.dev" },
    update: { name: "Ari Admin", role: UserRole.ADMIN, passwordHash: adminPassword },
    create: {
      email: "admin@flowforge.dev",
      name: "Ari Admin",
      role: UserRole.ADMIN,
      passwordHash: adminPassword,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@flowforge.dev" },
    update: { name: "Opal Operator", role: UserRole.OPERATOR, passwordHash: operatorPassword },
    create: {
      email: "operator@flowforge.dev",
      name: "Opal Operator",
      role: UserRole.OPERATOR,
      passwordHash: operatorPassword,
    },
  });

  await prisma.user.upsert({
    where: { email: "analyst@flowforge.dev" },
    update: { name: "Alex Analyst", role: UserRole.ANALYST, passwordHash: analystPassword },
    create: {
      email: "analyst@flowforge.dev",
      name: "Alex Analyst",
      role: UserRole.ANALYST,
      passwordHash: analystPassword,
    },
  });

  const workflow = await prisma.workflowDefinition.upsert({
    where: { slug: "high-value-order-review" },
    update: {
      description: "Escalates expensive orders for manual review.",
      status: WorkflowStatus.ACTIVE,
      triggerType: WorkflowTriggerType.EVENT,
      eventName: "order.created",
      cronExpression: null,
      nextScheduledAt: null,
      updatedByUserId: admin.id,
    },
    create: {
      name: "High Value Order Review",
      slug: "high-value-order-review",
      description: "Escalates expensive orders for manual review.",
      status: WorkflowStatus.ACTIVE,
      triggerType: WorkflowTriggerType.EVENT,
      eventName: "order.created",
      createdByUserId: operator.id,
      updatedByUserId: admin.id,
    },
  });

  await prisma.workflowStep.deleteMany({ where: { workflowId: workflow.id } });

  await prisma.workflowStep.createMany({
    data: [
      {
        workflowId: workflow.id,
        position: 1,
        name: "Flag high-value payload",
        actionType: WorkflowStepActionType.UPDATE_RUN_CONTEXT,
        config: {
          path: "review.required",
          value: true,
        },
        condition: {
          combinator: "all",
          rules: [{ leftPath: "payload.orderTotal", operator: "gt", rightValue: 5000 }],
        },
        maxRetries: 1,
      },
      {
        workflowId: workflow.id,
        position: 2,
        name: "Notify downstream case system",
        actionType: WorkflowStepActionType.HTTP_REQUEST,
        config: {
          method: "POST",
          url: "https://example.internal/api/cases",
          headers: [{ key: "x-source", value: "workflow-engine" }],
          body: {
            message: "Manual review required",
            orderId: "{{payload.orderId}}",
            reviewerQueue: "finance-ops",
          },
          storeResponseAs: "caseDispatch",
        },
        maxRetries: 3,
      },
    ],
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


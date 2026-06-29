import { eq } from "@repo/database";
import db from "@repo/database";
import { users } from "@repo/database/schema";

import type { ApprovalDefaults, SettingsService } from "./index";

const FALLBACK: ApprovalDefaults = {
  autoApproveEmail: false,
  autoApproveAgentEmail: false,
  autoApproveCalendar: false,
};

export function createDbSettingsService(): SettingsService {
  return {
    async getApprovalDefaults(userId: string): Promise<ApprovalDefaults> {
      const row = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          autoApproveEmail: true,
          autoApproveAgentEmail: true,
          autoApproveCalendar: true,
        },
      });
      if (!row) return FALLBACK;
      return {
        autoApproveEmail: row.autoApproveEmail,
        autoApproveAgentEmail: row.autoApproveAgentEmail,
        autoApproveCalendar: row.autoApproveCalendar,
      };
    },

    async updateApprovalDefaults(userId: string, input: ApprovalDefaults): Promise<ApprovalDefaults> {
      const [row] = await db
        .update(users)
        .set({
          autoApproveEmail: input.autoApproveEmail,
          autoApproveAgentEmail: input.autoApproveAgentEmail,
          autoApproveCalendar: input.autoApproveCalendar,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          autoApproveEmail: users.autoApproveEmail,
          autoApproveAgentEmail: users.autoApproveAgentEmail,
          autoApproveCalendar: users.autoApproveCalendar,
        });

      if (!row) return FALLBACK;
      return row;
    },
  };
}

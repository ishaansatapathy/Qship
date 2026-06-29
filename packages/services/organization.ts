import { db, eq } from "@repo/database";
import { organizationMembers, organizations, projects } from "@repo/database/schema";

import { ServiceError } from "./errors";

export async function ensurePersonalWorkspace(userId: string, displayName?: string | null) {
  const existing = await getMembershipForUser(userId);
  if (existing) return existing;

  const orgId = `org-${userId.slice(0, 8)}`;
  const projectId = `proj-${userId.slice(0, 8)}-core`;
  const slug = `workspace-${userId.slice(0, 8)}`.toLowerCase();
  const orgName = displayName?.trim() ? `${displayName.trim()}'s Workspace` : "My Workspace";

  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: orgName,
      slug,
      planTier: "free",
    })
    .onConflictDoNothing();

  await db
    .insert(organizationMembers)
    .values({
      id: `member-${userId.slice(0, 8)}`,
      organizationId: orgId,
      userId,
      role: "owner",
    })
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: projectId,
      organizationId: orgId,
      name: "Core Platform",
      description: "Default ShipFlow delivery pipeline",
    })
    .onConflictDoNothing();

  const membership = await getMembershipForUser(userId);
  if (!membership) {
    throw new ServiceError("INTERNAL", "Failed to create workspace");
  }
  return membership;
}

export async function getMembershipForUser(userId: string) {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    with: {
      organization: true,
    },
  });

  if (memberships.length === 0) return undefined;
  if (memberships.length === 1) return memberships[0];

  const roleRank: Record<string, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

  return [...memberships].sort((a, b) => {
    const aConnected = Boolean(a.organization.githubInstallationId);
    const bConnected = Boolean(b.organization.githubInstallationId);
    if (aConnected !== bConnected) return aConnected ? -1 : 1;

    const aRole = roleRank[a.role] ?? 9;
    const bRole = roleRank[b.role] ?? 9;
    if (aRole !== bRole) return aRole - bRole;

    return b.organization.updatedAt.getTime() - a.organization.updatedAt.getTime();
  })[0];
}

export async function getWorkspaceForUser(userId: string) {
  const membership = await getMembershipForUser(userId);
  if (!membership) return null;

  const orgProjects = await db.query.projects.findMany({
    where: eq(projects.organizationId, membership.organizationId),
    orderBy: (p, { asc }) => [asc(p.name)],
  });

  return {
    organization: membership.organization,
    role: membership.role,
    projects: orgProjects,
  };
}

export async function getOrganizationBySlug(slug: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
  });
  if (!org) throw new ServiceError("NOT_FOUND", "Organization not found");
  return org;
}

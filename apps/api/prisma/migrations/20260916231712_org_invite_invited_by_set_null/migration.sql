-- DropForeignKey
ALTER TABLE "organization_invites" DROP CONSTRAINT "organization_invites_invitedByUserId_fkey";

-- AlterTable
ALTER TABLE "organization_invites" ALTER COLUMN "invitedByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "mrs_check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedOn" DATE NOT NULL,
    "locale" "BriefLocale" NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "hotFlushes" SMALLINT NOT NULL,
    "heartDiscomfort" SMALLINT NOT NULL,
    "sleepProblems" SMALLINT NOT NULL,
    "depressiveMood" SMALLINT NOT NULL,
    "irritability" SMALLINT NOT NULL,
    "anxiety" SMALLINT NOT NULL,
    "exhaustion" SMALLINT NOT NULL,
    "sexualProblems" SMALLINT NOT NULL,
    "bladderProblems" SMALLINT NOT NULL,
    "vaginalDryness" SMALLINT NOT NULL,
    "jointMuscular" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mrs_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mrs_check_ins_userId_completedOn_key" ON "mrs_check_ins"("userId", "completedOn");

-- AddForeignKey
ALTER TABLE "mrs_check_ins" ADD CONSTRAINT "mrs_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Each MRS answer is 0 (none) to 4 (very severe). Prisma cannot express
-- this, so it is enforced here as well as in the API's validation.
ALTER TABLE "mrs_check_ins" ADD CONSTRAINT "mrs_check_ins_answers_range" CHECK (
    "hotFlushes" BETWEEN 0 AND 4
    AND "heartDiscomfort" BETWEEN 0 AND 4
    AND "sleepProblems" BETWEEN 0 AND 4
    AND "depressiveMood" BETWEEN 0 AND 4
    AND "irritability" BETWEEN 0 AND 4
    AND "anxiety" BETWEEN 0 AND 4
    AND "exhaustion" BETWEEN 0 AND 4
    AND "sexualProblems" BETWEEN 0 AND 4
    AND "bladderProblems" BETWEEN 0 AND 4
    AND "vaginalDryness" BETWEEN 0 AND 4
    AND "jointMuscular" BETWEEN 0 AND 4
);

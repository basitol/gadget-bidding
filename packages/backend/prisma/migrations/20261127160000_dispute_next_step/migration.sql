-- Cases: a short "what happens next" line our team sets for the buyer ("Hub re-test tomorrow").
ALTER TABLE "disputes" ADD COLUMN "next_step" VARCHAR(120);

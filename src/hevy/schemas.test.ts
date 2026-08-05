import { describe, expect, it } from "vitest";
import { bodyMeasurementSchema, bodyMeasurementWriteSchema } from "./schemas.js";

/**
 * Copied from Hevy's live OpenAPI document, which is only reachable by parsing
 * `https://api.hevyapp.com/docs/swagger-ui-init.js`. `BodyMeasurement` (the POST body)
 * and `PutBodyMeasurement` declare identical lists apart from `date`.
 *
 * Pinned rather than fetched, because a test must not depend on the network — but pinned
 * at all because a metric Hevy declares and these schemas omit is not merely unsupported,
 * it is destroyed: logBodyMeasurement merges over the *parsed* stored entry, so zod
 * strips the undeclared field and the PUT that follows nulls it, permanently and with no
 * delete endpoint to undo it. That is how left_thigh and right_thigh were being wiped.
 */
const HEVY_MEASUREMENT_FIELDS = [
  "weight_kg",
  "lean_mass_kg",
  "fat_percent",
  "neck_cm",
  "shoulder_cm",
  "chest_cm",
  "left_bicep_cm",
  "right_bicep_cm",
  "left_forearm_cm",
  "right_forearm_cm",
  "abdomen",
  "waist",
  "hips",
  "left_thigh",
  "right_thigh",
  "left_calf",
  "right_calf",
];

describe("body measurement schemas", () => {
  it("declares every metric Hevy does, because an omitted one gets nulled rather than ignored", () => {
    expect(Object.keys(bodyMeasurementWriteSchema.shape).sort()).toEqual([...HEVY_MEASUREMENT_FIELDS].sort());
  });

  it("reads back every metric it can write", () => {
    const readable = Object.keys(bodyMeasurementSchema.shape).filter((field) => !["id", "date", "created_at"].includes(field));

    expect(readable.sort()).toEqual([...HEVY_MEASUREMENT_FIELDS].sort());
  });
});

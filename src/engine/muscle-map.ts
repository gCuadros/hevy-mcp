export interface MuscleMapTemplate {
  id: string;
  primaryMuscleGroup: string;
}

/**
 * Resolves exercise_template_id -> primary muscle group, built from the
 * already-cached exercise templates. No separately curated dataset: Hevy's
 * own `primary_muscle_group` is granular enough for v1's volume reporting.
 */
export function buildMuscleGroupResolver(templates: MuscleMapTemplate[]): (exerciseTemplateId: string) => string | null {
  const byId = new Map(templates.map((template) => [template.id, template.primaryMuscleGroup]));
  return (exerciseTemplateId: string) => byId.get(exerciseTemplateId) ?? null;
}

import { z } from "zod";

/**
 * RecipeV1 = contrato único entre /api/recipe y la UI.
 * - Lo hacemos tolerante (coerce/catch) para que el MVP no se rompa por detalles tontos.
 * - Aun así, exige lo importante: title, timeMinutes, ingredients, steps, trick/error/fix/wow.
 */

const IngredientSchema = z.object({
  item: z.coerce.string().min(1, "ingredient.item vacío"),
  amount: z.coerce.string().catch(""),
});

const SubstituteSchema = z.object({
  for: z.coerce.string().min(1, "substitute.for vacío"),
  instead: z.coerce.string().min(1, "substitute.instead vacío"),
});

const StepSchema = z.object({
  text: z.coerce.string().min(1, "step.text vacío"),
  timerSec: z.coerce.number().int().nonnegative().catch(0),
});

const ZeyraOptionalSchema = z.object({
  title: z.coerce.string().min(1),
  text: z.coerce.string().min(1),
  url: z.coerce
    .string()
    .refine((s) => {
      try {
        new URL(s);
        return true;
      } catch {
        return false;
      }
    }, "url inválida"),
});

export const RecipeV1Schema = z
  .object({
    title: z.coerce.string().min(1, "title vacío"),
    menuPitch: z.coerce.string().optional(),

    timeMinutes: z.coerce.number().int().min(1).max(240),
    servings: z.coerce.number().int().min(1).max(12).catch(1),

    ingredients: z.array(IngredientSchema).min(1, "ingredients vacío"),
    substitutes: z.array(SubstituteSchema).catch([]),

    steps: z.array(StepSchema).min(1, "steps vacío"),

    trick: z.coerce.string().min(1, "trick vacío"),
    errorCommon: z.coerce.string().min(1, "errorCommon vacío"),
    fix: z.coerce.string().min(1, "fix vacío"),
    wow: z.coerce.string().min(1, "wow vacío"),

    platingTips: z.array(z.coerce.string().min(1)).catch([]),

    zeyraOptional: z.union([ZeyraOptionalSchema, z.null()]).catch(null),
  })
  // Si la IA mete campos extra, los ignoramos en el MVP:
  .strip();

export type RecipeV1 = z.infer<typeof RecipeV1Schema>;

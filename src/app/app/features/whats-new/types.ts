import { z } from "zod";

export const updateSectionKeySchema = z.enum(["improvements", "fixes"]);
export type UpdateSectionKey = z.infer<typeof updateSectionKeySchema>;

export const updateReleaseFileSchema = z.object({
  headline: z.string().optional(),
  summary: z.string().optional(),
  learn_more_url: z.string().optional(),
  cta: z
    .object({
      label: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  sections: z
    .object({
      improvements: z.array(z.string()).optional(),
      fixes: z.array(z.string()).optional(),
    })
    .partial(),
});
export type UpdateReleaseFile = z.infer<typeof updateReleaseFileSchema>;

export type UpdateRelease = UpdateReleaseFile & {
  release_date: string;
};

export const updatesIndexSchema = z.array(z.string());

import { z } from "zod"
import type { SeoActionMeasurement as MeasurementRecord } from "@prisma/client"
import type { SeoActionMeasurement } from "@seo/shared"

const Metrics = z.object({ clicks: z.number().finite().nonnegative(), impressions: z.number().finite().nonnegative(), ctr: z.number().finite().nullable(), position: z.number().finite().nullable() })
export const ComparisonResultSchema = z.object({
  expectedPages: z.number().int().nonnegative(), comparablePages: z.number().int().nonnegative(),
  missingBeforePages: z.number().int().nonnegative(), missingAfterPages: z.number().int().nonnegative(),
  comparableExamples: z.array(z.string().url()).max(5), before: Metrics.nullable(), after: Metrics.nullable(),
  changes: z.object({ clicks: z.number().finite(), clicksPercent: z.number().finite().nullable(), impressions: z.number().finite(), impressionsPercent: z.number().finite().nullable(), ctrPoints: z.number().finite().nullable(), position: z.number().finite().nullable() }).nullable(),
})

export function measurementDto(record: MeasurementRecord): SeoActionMeasurement | null {
  const parsed = ComparisonResultSchema.safeParse(record.result)
  if (!parsed.success || (record.windowDays !== 7 && record.windowDays !== 28)) return null
  return { ...parsed.data, id: record.id, propertyUrl: record.propertyUrl, windowDays: record.windowDays,
    beforeStartDate: record.beforeStartDate, beforeEndDate: record.beforeEndDate, afterStartDate: record.afterStartDate,
    afterEndDate: record.afterEndDate, measuredAt: record.measuredAt.toISOString(), rowLimitReached: record.rowLimitReached }
}

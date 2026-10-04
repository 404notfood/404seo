import { z } from "zod"
import type { AnalyticsActionMeasurement } from "@prisma/client"
import type { AnalyticsMeasurement } from "@seo/shared"
import { AnalyticsQualitySchema } from "./analytics"

const Summary = z.object({ sessions: z.number().finite().nonnegative(), keyEvents: z.number().finite().nonnegative(), purchaseRevenue: z.number().finite().nullable() })
const Comparison = z.object({ expectedPages: z.number().int().nonnegative(), comparablePages: z.number().int().nonnegative(),
  missingBeforePages: z.number().int().nonnegative(), missingAfterPages: z.number().int().nonnegative(), comparableExamples: z.array(z.string().url()).max(5),
  before: Summary.nullable(), after: Summary.nullable(), changes: z.object({ sessions: z.number().finite(), sessionsPercent: z.number().finite().nullable(), keyEvents: z.number().finite(), purchaseRevenue: z.number().finite().nullable() }).nullable() })

export function analyticsMeasurementDto(record: AnalyticsActionMeasurement): AnalyticsMeasurement | null {
  const result = Comparison.safeParse(record.result)
  const quality = AnalyticsQualitySchema.safeParse(record.quality)
  if (!result.success || !quality.success || (record.windowDays !== 7 && record.windowDays !== 28)) return null
  return { ...result.data, quality: quality.data, id: record.id, propertyId: record.propertyId, streamId: record.streamId,
    timeZone: record.timeZone, currencyCode: record.currencyCode, windowDays: record.windowDays, beforeStartDate: record.beforeStartDate,
    beforeEndDate: record.beforeEndDate, afterStartDate: record.afterStartDate, afterEndDate: record.afterEndDate, measuredAt: record.measuredAt.toISOString() }
}

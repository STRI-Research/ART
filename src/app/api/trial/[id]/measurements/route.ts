import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { measurementHeader } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()

  const headers = await db
    .select()
    .from(measurementHeader)
    .where(eq(measurementHeader.trialId, Number(id)))
    .orderBy(asc(measurementHeader.ordinal))

  return NextResponse.json(headers)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const trialId = Number(id)
  const db = getDb()
  const body = await req.json()

  const [created] = await db
    .insert(measurementHeader)
    .values({
      trialId,
      partMeasured: body.partMeasured ?? '',
      measurementType: body.measurementType ?? '',
      measurementUnit: body.measurementUnit ?? '',
      applicationRef: body.applicationRef ?? '',
      daysAfter: body.daysAfter ?? null,
      timing: body.timing ?? '',
      description: body.description ?? '',
      ordinal: body.ordinal ?? 0,
      // Site-added columns only: origin/locked are not caller-controlled.
      origin: 'site',
      locked: false,
      analyze: body.analyze ?? true,
      subsamples: Math.max(1, body.subsamples ?? 1),
      formula: body.formula ?? '',
      measurementDate: body.measurementDate ?? '',
      assessedBy: body.assessedBy ?? '',
      growthStage: body.growthStage ?? '',
    })
    .returning()

  return NextResponse.json(created)
}

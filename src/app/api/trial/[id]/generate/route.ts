import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { trial, protocol, treatment, plot, auditLog } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getTrialSnapshot } from '@/lib/trialSnapshot'
import { validateDesign, defaultCols } from '@shared/design'
import type { DesignType } from '@shared/types'
import { getActor } from '@/lib/actor'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

/** Deterministic PRNG (mulberry32) so a given seed always reproduces the same layout. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const db = getDb()
  const trialId = Number(id)

  const [tr] = await db.select().from(trial).where(eq(trial.id, trialId))
  if (!tr) return badRequest('Trial not found')
  if (tr.layoutLockedAt) return badRequest('Layout is locked')

  const [proto] = await db.select().from(protocol).where(eq(protocol.id, tr.protocolId))
  if (!proto) return badRequest('Protocol not found')

  const treatments = await db
    .select()
    .from(treatment)
    .where(eq(treatment.protocolId, proto.id))
    .orderBy(asc(treatment.number))

  const design = proto.design as DesignType
  const validation = validateDesign(design, proto.replicates, proto.blockSize, treatments.length)
  if (!validation.ok) return badRequest(validation.error ?? 'Invalid design')

  if (design !== 'RCB' && design !== 'CRD' && design !== 'ALPHA') {
    return badRequest(`Unsupported design: ${design}`)
  }

  const body = await req.json().catch(() => ({}) as { seed?: number })
  const seed = Number.isInteger(body?.seed) ? (body!.seed as number) : Math.floor(Math.random() * 1_000_000_000)
  const rand = mulberry32(seed)

  const treatmentCount = treatments.length
  const replicates = proto.replicates
  const cols = defaultCols(design, proto.blockSize, treatmentCount)

  type NewPlot = { plotNumber: number; rep: number; block: number; treatmentNumber: number }
  const newPlots: NewPlot[] = []

  if (design === 'RCB') {
    // Each replicate is its own random permutation of the treatments; plot order = rep * numTreatments + position.
    for (let repIdx = 0; repIdx < replicates; repIdx++) {
      const perm = shuffle(
        treatments.map((t) => t.number),
        rand
      )
      for (let pos = 0; pos < treatmentCount; pos++) {
        const order = repIdx * treatmentCount + pos
        newPlots.push({ plotNumber: order + 1, rep: repIdx + 1, block: repIdx + 1, treatmentNumber: perm[pos] })
      }
    }
  } else if (design === 'ALPHA') {
    // Alpha (incomplete block): each replicate is a random permutation of all treatments,
    // split into s incomplete blocks of k plots. Block numbers are per-replicate (1..s).
    const k = proto.blockSize
    const s = treatmentCount / k // blocks per replicate
    for (let repIdx = 0; repIdx < replicates; repIdx++) {
      const perm = shuffle(
        treatments.map((t) => t.number),
        rand
      )
      for (let b = 0; b < s; b++) {
        for (let j = 0; j < k; j++) {
          const plotIdx = repIdx * treatmentCount + b * k + j
          newPlots.push({
            plotNumber: plotIdx + 1,
            rep: repIdx + 1,
            block: b + 1,
            treatmentNumber: perm[b * k + j],
          })
        }
      }
    }
  } else {
    // CRD: no blocking — every treatment appears `replicates` times, positions fully shuffled.
    const pool: { treatmentNumber: number; rep: number }[] = []
    for (const t of treatments) {
      for (let r = 1; r <= replicates; r++) pool.push({ treatmentNumber: t.number, rep: r })
    }
    const shuffled = shuffle(pool, rand)
    shuffled.forEach((entry, i) => {
      newPlots.push({ plotNumber: i + 1, rep: entry.rep, block: 0, treatmentNumber: entry.treatmentNumber })
    })
  }

  const plotRows = Math.ceil(newPlots.length / cols)
  const treatmentIdByNumber = new Map(treatments.map((t) => [t.number, t.id]))

  await db.delete(plot).where(eq(plot.trialId, trialId))

  await db.insert(plot).values(
    newPlots.map((p, i) => ({
      trialId,
      plotNumber: p.plotNumber,
      rep: p.rep,
      block: p.block,
      treatmentId: treatmentIdByNumber.get(p.treatmentNumber)!,
      mapRow: Math.floor(i / cols),
      mapCol: i % cols,
    }))
  )

  await db
    .update(trial)
    .set({ plotRows, plotCols: cols, seed, updatedAt: new Date() })
    .where(eq(trial.id, trialId))

  try {
    const actor = await getActor()
    await db.insert(auditLog).values({
      trialId,
      protocolId: proto.id,
      role: 'trial',
      actor,
      action: 'trial.generate',
      entity: `trial:${trialId}`,
      summary: `Generated ${design} layout — ${replicates} rep(s), ${newPlots.length} plots, seed ${seed}`,
      detail: JSON.stringify({ design, replicates, seed, plotCount: newPlots.length, cols }),
    })
  } catch {}

  return NextResponse.json(await getTrialSnapshot(db, trialId))
}

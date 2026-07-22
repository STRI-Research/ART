import { asc, eq, inArray } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { treatment, treatmentApplication, treatmentComponent } from '@/lib/db/schema'

type Db = ReturnType<typeof getDb>

/** A protocol's treatments with their legacy program lines and structured components attached. */
export async function loadTreatments(db: Db, protocolId: number) {
  const rows = await db
    .select()
    .from(treatment)
    .where(eq(treatment.protocolId, protocolId))
    .orderBy(asc(treatment.number))

  const trtIds = rows.map((t) => t.id)
  const apps = trtIds.length
    ? await db
        .select()
        .from(treatmentApplication)
        .where(inArray(treatmentApplication.treatmentId, trtIds))
        .orderBy(asc(treatmentApplication.treatmentId), asc(treatmentApplication.ordinal))
    : []
  const components = trtIds.length
    ? await db
        .select()
        .from(treatmentComponent)
        .where(inArray(treatmentComponent.treatmentId, trtIds))
        .orderBy(asc(treatmentComponent.treatmentId), asc(treatmentComponent.ordinal))
    : []

  const appsByTrt = new Map<number, typeof apps>()
  for (const a of apps) {
    const arr = appsByTrt.get(a.treatmentId) ?? []
    arr.push(a)
    appsByTrt.set(a.treatmentId, arr)
  }
  const compsByTrt = new Map<number, typeof components>()
  for (const c of components) {
    const arr = compsByTrt.get(c.treatmentId) ?? []
    arr.push(c)
    compsByTrt.set(c.treatmentId, arr)
  }

  return rows.map((t) => ({
    ...t,
    applications: appsByTrt.get(t.id) ?? [],
    components: compsByTrt.get(t.id) ?? [],
  }))
}

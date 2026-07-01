import type { AovResult, Treatment } from '@shared/types'

/** Treatment means table with mean-separation letters, sorted best-to-worst. */
export function MeansTable({
  result,
  treatments
}: {
  result: AovResult
  treatments: Treatment[]
}): JSX.Element {
  const nameByNumber = new Map(treatments.map((t) => [t.number, t.name || `Treatment ${t.number}`]))
  const sorted = [...result.means].sort((a, b) => b.mean - a.mean)

  return (
    <table className="data">
      <thead>
        <tr>
          <th style={{ width: 40 }}>#</th>
          <th>Treatment</th>
          <th className="num">Mean</th>
          <th className="num">Group</th>
          <th className="num">n</th>
          <th className="num">Std dev</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((m) => (
          <tr key={m.treatment}>
            <td className="num">{m.treatment}</td>
            <td>{nameByNumber.get(m.treatment) ?? `Treatment ${m.treatment}`}</td>
            <td className="num">{m.mean.toFixed(3)}</td>
            <td className="num">
              <span className="means-letter">{m.group}</span>
            </td>
            <td className="num">{m.n}</td>
            <td className="num">{Number.isFinite(m.std) ? m.std.toFixed(3) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

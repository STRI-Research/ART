/**
 * Minimal ambient typing for the `jstat` package (ships no types of its own).
 * Only the surface actually used by `src/lib/stats/anova.ts` is declared.
 */
declare module 'jstat' {
  const jStat: {
    mean(arr: number[]): number
    studentt: {
      inv(p: number, dof: number): number
      cdf(x: number, dof: number): number
    }
    centralF: {
      cdf(x: number, df1: number, df2: number): number
    }
    tukey: {
      cdf(q: number, nmeans: number, df: number): number
      inv(p: number, nmeans: number, df: number): number
    }
  }
  export = jStat
}

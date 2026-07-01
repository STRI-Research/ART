#!/usr/bin/env Rscript
# ANOVA + mean-comparison sidecar for Open ARM.
# Reads JSON { design, test, alpha, data:[{treatment,rep,value}] } on stdin.
# Writes JSON { ok, result } where result matches the AovResult shape in
# src/shared/types.ts.

suppressWarnings(suppressMessages({
  library(jsonlite)
  library(agricolae)
}))

emit <- function(x) cat(toJSON(x, auto_unbox = TRUE, na = "null", digits = 10))

tryCatch({
  req   <- fromJSON(readLines(file("stdin"), warn = FALSE))
  design <- req$design
  test   <- req$test
  alpha  <- as.numeric(req$alpha)
  df     <- as.data.frame(req$data)

  df$treatment <- factor(df$treatment)
  df$rep       <- factor(df$rep)
  df$value     <- as.numeric(df$value)

  # Model: RCB blocks on rep; CRD does not.
  model <- if (identical(design, "RCB")) {
    aov(value ~ treatment + rep, data = df)
  } else {
    aov(value ~ treatment, data = df)
  }

  atab <- as.data.frame(anova(model))
  anovaRows <- lapply(seq_len(nrow(atab)), function(i) {
    list(
      source  = rownames(atab)[i],
      df      = atab[i, "Df"],
      ss      = atab[i, "Sum Sq"],
      ms      = atab[i, "Mean Sq"],
      f       = if ("F value" %in% colnames(atab)) atab[i, "F value"] else NA,
      pValue  = if ("Pr(>F)" %in% colnames(atab)) atab[i, "Pr(>F)"] else NA
    )
  })

  # Mean comparison via agricolae. Model form auto-extracts DFerror/MSerror.
  cmp <- switch(test,
    LSD    = LSD.test(model, "treatment", alpha = alpha, group = TRUE, console = FALSE),
    TUKEY  = HSD.test(model, "treatment", alpha = alpha, group = TRUE, console = FALSE),
    DUNCAN = duncan.test(model, "treatment", alpha = alpha, group = TRUE, console = FALSE),
    SNK    = SNK.test(model, "treatment", alpha = alpha, group = TRUE, console = FALSE),
    stop(paste("Unknown test:", test))
  )

  stats <- cmp$statistics
  cv        <- if ("CV" %in% colnames(stats)) stats$CV[1] else NA
  grandMean <- if ("Mean" %in% colnames(stats)) stats$Mean[1] else mean(df$value)
  mserror   <- if ("MSerror" %in% colnames(stats)) stats$MSerror[1] else NA

  # Critical value + label differ by test.
  crit <- NA; critLabel <- paste0(test, " (", alpha, ")")
  if (test == "LSD" && "LSD" %in% colnames(stats)) { crit <- stats$LSD[1]; critLabel <- paste0("LSD (", alpha, ")") }
  if (test == "TUKEY" && "MSD" %in% colnames(stats)) { crit <- stats$MSD[1]; critLabel <- paste0("HSD (", alpha, ")") }

  # Per-treatment means, std, n from cmp$means; letters from cmp$groups.
  means  <- cmp$means
  groups <- cmp$groups
  # groups rownames are treatment labels; first column is the mean, "groups" is letters.
  grpLetters <- setNames(as.character(groups$groups), rownames(groups))

  meanRows <- lapply(rownames(means), function(t) {
    list(
      treatment = as.integer(as.character(t)),
      mean      = means[t, 1],
      n         = if ("r" %in% colnames(means)) means[t, "r"] else NA,
      std       = if ("std" %in% colnames(means)) means[t, "std"] else NA,
      group     = if (!is.na(grpLetters[t])) grpLetters[[t]] else ""
    )
  })
  # Order by treatment number ascending for stable display.
  meanRows <- meanRows[order(sapply(meanRows, function(m) m$treatment))]

  rMean   <- if ("r" %in% colnames(means)) mean(means[["r"]]) else NA
  stdError <- if (!is.na(mserror) && !is.na(rMean)) sqrt(mserror / rMean) else NA

  # Treatment effect significance from the ANOVA treatment row.
  trtP <- anovaRows[[which(sapply(anovaRows, function(r) r$source == "treatment"))]]$pValue
  significant <- !is.na(trtP) && trtP < alpha

  result <- list(
    anova              = anovaRows,
    means              = meanRows,
    grandMean          = grandMean,
    cv                 = cv,
    lsd                = crit,
    criticalValueLabel = critLabel,
    stdError           = stdError,
    test               = test,
    alpha              = alpha,
    significant        = significant
  )

  emit(list(ok = TRUE, result = result))
}, error = function(e) {
  emit(list(ok = FALSE, error = conditionMessage(e)))
})

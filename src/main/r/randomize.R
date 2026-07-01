#!/usr/bin/env Rscript
# Randomization sidecar for Open ARM.
# Reads JSON { design, treatments, replicates, seed } on stdin.
# Writes JSON { ok, result: [ { order, rep, treatment } ] } on stdout.
# `treatment` is the 1-based treatment number; `rep` is the 1-based block.

suppressWarnings(suppressMessages({
  library(jsonlite)
  library(agricolae)
}))

emit <- function(x) cat(toJSON(x, auto_unbox = TRUE, na = "null"))

tryCatch({
  req <- fromJSON(readLines(file("stdin"), warn = FALSE))
  design      <- req$design
  treatments  <- as.integer(req$treatments)
  replicates  <- as.integer(req$replicates)
  seed        <- as.integer(req$seed)

  trt <- seq_len(treatments)

  if (identical(design, "RCB")) {
    d    <- design.rcbd(trt, r = replicates, seed = seed, serie = 0)
    book <- d$book
    reps <- as.integer(as.character(book$block))
  } else if (identical(design, "CRD")) {
    d    <- design.crd(trt, r = replicates, seed = seed, serie = 0)
    book <- d$book
    reps <- as.integer(as.character(book$r))
  } else {
    stop(paste("Unknown design:", design))
  }

  # Treatment column is always the last column of the book.
  trtCol <- as.integer(as.character(book[[ncol(book)]]))

  result <- data.frame(
    order     = seq_len(nrow(book)),
    rep       = reps,
    treatment = trtCol
  )

  emit(list(ok = TRUE, result = result))
}, error = function(e) {
  emit(list(ok = FALSE, error = conditionMessage(e)))
})

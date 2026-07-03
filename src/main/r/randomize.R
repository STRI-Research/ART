#!/usr/bin/env Rscript
# Randomization sidecar for Open ARM.
# Reads JSON { design, treatments, replicates, blockSize, seed } on stdin.
# Writes JSON { ok, result: [ { order, rep, block, treatment } ] } on stdout.
# `treatment` is the 1-based treatment number; `rep` is the 1-based replicate;
# `block` is the incomplete block within the rep (ALPHA) and equals `rep` otherwise.
# `blockSize` (k) is required only by the ALPHA design.

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
  blockSize   <- if (is.null(req$blockSize)) NA_integer_ else as.integer(req$blockSize)
  seed        <- as.integer(req$seed)

  trt <- seq_len(treatments)

  if (identical(design, "RCB")) {
    d      <- design.rcbd(trt, r = replicates, seed = seed, serie = 0)
    book   <- d$book
    reps   <- as.integer(as.character(book$block))
    blocks <- reps # complete blocks: the block is the replicate
  } else if (identical(design, "CRD")) {
    d      <- design.crd(trt, r = replicates, seed = seed, serie = 0)
    book   <- d$book
    reps   <- as.integer(as.character(book$r))
    blocks <- reps # no blocking; keep block = rep for a uniform shape
  } else if (identical(design, "ALPHA")) {
    if (is.na(blockSize)) stop("Alpha design requires a block size (k).")
    # Resolvable incomplete block (alpha) design: r replicates, each split into
    # s = treatments / k incomplete blocks of size k. agricolae errors if k does
    # not divide the treatment count or r is unsupported.
    d      <- design.alpha(trt, k = blockSize, r = replicates, seed = seed, serie = 0)
    book   <- d$book
    reps   <- as.integer(as.character(book$replication))
    blocks <- as.integer(as.character(book$block))
  } else {
    stop(paste("Unknown design:", design))
  }

  # Treatment column is always the last column of the book.
  trtCol <- as.integer(as.character(book[[ncol(book)]]))

  result <- data.frame(
    order     = seq_len(nrow(book)),
    rep       = reps,
    block     = blocks,
    treatment = trtCol
  )

  emit(list(ok = TRUE, result = result))
}, error = function(e) {
  emit(list(ok = FALSE, error = conditionMessage(e)))
})

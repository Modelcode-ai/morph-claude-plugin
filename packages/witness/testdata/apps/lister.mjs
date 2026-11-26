// Fake pytest for `--collect-only -q`: prints node ids from LISTER_IDS (comma list), or fails with LISTER_FAIL.
if (process.env.LISTER_FAIL) {
  console.error("ERROR: collection failed");
  process.exit(2);
}
if (process.argv.includes("--collect-only")) {
  for (const id of (process.env.LISTER_IDS ?? "").split(",").filter(Boolean)) console.log(id);
  console.log(`\n${(process.env.LISTER_IDS ?? "").split(",").filter(Boolean).length} tests collected in 0.01s`);
}
